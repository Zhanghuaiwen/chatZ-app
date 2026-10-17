import { SYSTEM_PROMPT } from "../../src/constants.js";

/** Converts a stored message (with optional media attachments) into the
 *  provider-specific wire format. Mirrors the client-side logic so the server
 *  can own request construction (context, keep_alive, cache keys).
 *
 *  SiliconFlow uses OpenAI-compatible multimodal `content` parts:
 *  text / image_url / video_url / audio_url (data URLs are accepted).
 *  Ollama takes a base64 `images` array alongside plain text content. */
function toApiMessage(msg, provider) {
  const atts = msg.attachments;
  if (!atts?.length) return { role: msg.role, content: msg.content };

  if (provider === "ollama") {
    const images = atts
      .filter((a) => a.type === "image")
      .map((a) => a.dataUrl.replace(/^data:image\/[^;]+;base64,/, ""));
    const pieces = [msg.content];
    for (const a of atts) {
      if (a.type === "text") {
        pieces.push(`用户上传的文件「${a.name}」内容如下:\n${a.text}`);
      } else if (a.type === "video" || a.type === "audio") {
        pieces.push(`[用户上传了 ${a.type} 文件：${a.name}]`);
      }
    }
    const out = {
      role: msg.role,
      content: pieces.filter(Boolean).join("\n\n") || "",
    };
    if (images.length) out.images = images;
    return out;
  }

  const parts = [];
  if (msg.content) parts.push({ type: "text", text: msg.content });
  for (const a of atts) {
    if (a.type === "image") {
      parts.push({
        type: "image_url",
        image_url: { url: a.dataUrl, detail: "auto" },
      });
    } else if (a.type === "video") {
      parts.push({
        type: "video_url",
        video_url: { url: a.dataUrl, detail: "auto", max_frames: 16, fps: 1 },
      });
    } else if (a.type === "audio") {
      parts.push({ type: "audio_url", audio_url: { url: a.dataUrl } });
    } else if (a.type === "text") {
      parts.push({
        type: "text",
        text: `用户上传的文件「${a.name}」内容如下:\n${a.text}`,
      });
    }
  }
  return { role: msg.role, content: parts };
}

const hasContent = (m) => {
  if (Array.isArray(m.content)) return m.content.length > 0;
  return typeof m.content === "string" && m.content.trim().length > 0;
};

/**
 * Builds the full provider message list in a cache-friendly order:
 *   [stable system] → [history (append-only)] → [new user turn]
 * The system prompt and prior turns are never mutated, so the token prefix
 * stays byte-stable across turns and the provider can reuse its KV/prefix cache.
 */
export function buildAllMessages(history, userMsg, provider, systemPrompt) {
  const convert = (m) => toApiMessage(m, provider);
  const msgs = [
    convert({ role: "system", content: systemPrompt || SYSTEM_PROMPT }),
    ...history.map(convert),
    convert(userMsg),
  ];
  // Drop empty turns (e.g. an assistant turn stopped before producing text);
  // SiliconFlow rejects them with "Message field is required".
  const filtered = msgs.filter(hasContent);
  return filtered.length ? filtered : msgs;
}

/** Ollama keeps the model resident (and its prefix cache warm) between turns. */
const OLLAMA_KEEP_ALIVE = process.env.CHATZ_KEEP_ALIVE || "30m";

/** Whether to send an explicit `prompt_cache_key` to SiliconFlow. Off by
 *  default to stay compatible with servers that reject unknown fields. */
const SEND_PROMPT_CACHE_KEY = process.env.CHATZ_PROMPT_CACHE_KEY === "1";

/**
 * Builds the provider-specific upstream request.
 * `ollama` uses the local API; `siliconflow` uses an OpenAI-compatible endpoint.
 */
export function buildChatRequest(
  { provider, apiKey, model, messages, promptCacheKey },
  signal,
) {
  if (provider === "ollama") {
    return {
      url: "http://127.0.0.1:11434/api/chat",
      options: {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages,
          stream: true,
          keep_alive: OLLAMA_KEEP_ALIVE,
        }),
        signal,
      },
    };
  }

  const body = {
    model,
    messages,
    stream: true,
    temperature: 0.7,
    max_tokens: 2048,
    // Ask the API to include token usage (and cached-token counts) in the
    // final stream chunk so we can surface cache-hit stats.
    stream_options: { include_usage: true },
  };
  if (SEND_PROMPT_CACHE_KEY && promptCacheKey) {
    body.prompt_cache_key = promptCacheKey;
  }

  return {
    url: "https://api.siliconflow.cn/v1/chat/completions",
    options: {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal,
    },
  };
}
