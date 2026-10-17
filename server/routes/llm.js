import { getSetting } from "../repositories/settings.js";
import { buildContext, extractUsage } from "../services/context.js";
import { buildChatRequest } from "../services/providers.js";

/**
 * Streaming chat proxy. The server owns context construction (stable prefix)
 * and provider parameters (Ollama keep_alive, SiliconFlow usage reporting),
 * then pipes the upstream SSE stream back to the browser verbatim and appends
 * a final `chatz_usage` event with the token/cache statistics.
 */
export default async function llmRoutes(app) {
  app.post("/api/llm/chat", async (req, reply) => {
    const body = req.body || {};
    const saved = getSetting("settings", {}) || {};

    const provider = body.provider || saved.provider || "ollama";
    const model = body.model || saved.model;
    const apiKey = body.apiKey || saved.apiKey || "";
    const history = Array.isArray(body.history) ? body.history : [];
    const message = body.message;

    if (!model) return reply.code(400).send({ error: "缺少模型" });
    if (!message) return reply.code(400).send({ error: "缺少消息" });
    if (provider === "siliconflow" && !apiKey) {
      return reply.code(400).send({ error: "缺少 API Key" });
    }

    const { messages, cacheKey } = buildContext({
      provider,
      model,
      conversationId: body.conversationId,
      history,
      message,
    });
    const { url, options } = buildChatRequest({
      provider,
      apiKey,
      model,
      messages,
      promptCacheKey: cacheKey,
    });

    const controller = new AbortController();
    // Abort the upstream request when the client disconnects. Listen on the
    // response, not the request: `req.raw`'s 'close' fires as soon as the
    // request body is consumed, which would kill the stream immediately.
    const onClose = () => controller.abort();
    reply.raw.on("close", onClose);

    let upstream;
    try {
      upstream = await fetch(url, { ...options, signal: controller.signal });
    } catch (err) {
      reply.raw.off("close", onClose);
      if (controller.signal.aborted) return;
      return reply.code(502).send({ error: `上游请求失败: ${err.message}` });
    }

    if (!upstream.ok || !upstream.body) {
      const text = await upstream.text().catch(() => "");
      reply.raw.off("close", onClose);
      let msg = "";
      try {
        const j = JSON.parse(text);
        msg = j.error?.message || j.error || j.message;
      } catch {
        msg = text;
      }
      return reply
        .code(upstream.ok ? 502 : upstream.status)
        .send({ error: msg || `上游错误 (${upstream.status})` });
    }

    reply.hijack();
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let usage = null;

    const scan = (line) => {
      if (!line) return;
      const u = extractUsage(line, provider);
      if (u) usage = u;
    };

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        reply.raw.write(Buffer.from(value));
        buffer += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buffer.indexOf("\n")) >= 0) {
          scan(buffer.slice(0, idx).trim());
          buffer = buffer.slice(idx + 1);
        }
      }
      scan(buffer.trim());
    } catch (err) {
      if (!controller.signal.aborted) {
        app.log.warn({ err: err.message }, "upstream stream error");
      }
    } finally {
      if (usage) {
        try {
          const payload = JSON.stringify({ chatz_usage: usage });
          reply.raw.write(
            provider === "ollama" ? `${payload}\n` : `data: ${payload}\n\n`,
          );
        } catch {
          // client already disconnected
        }
      }
      reply.raw.off("close", onClose);
      try {
        reader.cancel();
      } catch {
        // ignore
      }
      reply.raw.end();
    }
  });
}
