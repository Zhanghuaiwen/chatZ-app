import { SYSTEM_PROMPT } from "../constants";

/** Prepends the system prompt to a conversation's message history. */
export function buildAllMessages(history, userMsg) {
  return [
    { role: "system", content: SYSTEM_PROMPT },
    ...history,
    userMsg,
  ];
}

/**
 * Builds the provider-specific fetch request.
 * `ollama` uses the local API; `siliconflow` uses an OpenAI-compatible endpoint.
 */
export function buildChatRequest({ provider, apiKey, model, messages }, signal) {
  const base = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages, stream: true }),
    signal,
  };

  if (provider === "ollama") {
    return { url: "/ollama/api/chat", options: base };
  }

  return {
    url: "/api/chat/completions",
    options: {
      ...base,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        temperature: 0.7,
        max_tokens: 2048,
      }),
    },
  };
}

/**
 * Creates an SSE line parser for the given provider.
 * Returns `false` when the stream should end, `true` otherwise.
 * Accumulated assistant text is reported via `onDelta`.
 */
export function createStreamParser({ provider, onDelta }) {
  let content = "";

  return (raw) => {
    const trimmed = raw.trim();
    if (!trimmed) return true;

    let line = trimmed;
    if (provider !== "ollama") {
      if (line === "data: [DONE]") return false;
      if (!line.startsWith("data: ")) return true;
      line = line.slice(6);
    }

    try {
      const json = JSON.parse(line);
      let delta = "";
      if (provider === "ollama") {
        delta = json.message?.content || "";
      } else {
        if (json.choices?.[0]?.finish_reason === "break") return true;
        delta = json.choices?.[0]?.delta?.content || "";
      }

      if (delta) {
        content += delta;
        onDelta(content);
      }
    } catch {
      // ignore malformed SSE chunks
    }
    return true;
  };
}

/**
 * Reads a fetch stream until EOF, splitting it into SSE lines.
 * Stops early when `isStale()` returns true or `onLine` signals end-of-stream.
 */
export async function consumeStream(reader, onLine, isStale) {
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop();

    for (const line of lines) {
      if (isStale() || !onLine(line)) return false;
    }
  }

  buffer += decoder.decode();
  if (buffer.trim() && !isStale()) return onLine(buffer);
  return true;
}

/** Extracts a human-readable message from a failed API response. */
export async function readApiError(res) {
  const body = await res.json().catch(() => ({}));
  const message =
    typeof body.error === "string"
      ? body.error
      : body.error?.message || body.message;
  return message || `请求失败 (${res.status})`;
}
