import { SYSTEM_PROMPT } from "../constants";

/** Converts a stored message (with optional media attachments) into the
 *  provider-specific wire format.
 *
 *  SiliconFlow uses OpenAI-compatible multimodal `content` parts:
 *  text / image_url / video_url / audio_url (data URLs are accepted).
 *  Ollama takes a base64 `images` array alongside plain text content. */
function toApiMessage(msg, provider) {
  const atts = msg.attachments;
  if (!atts?.length) return msg;

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

/** Prepends the system prompt to a conversation's message history. */
export function buildAllMessages(history, userMsg, provider) {
  const convert = (m) => toApiMessage(m, provider);
  const msgs = [
    convert({ role: "system", content: SYSTEM_PROMPT }),
    ...history.map(convert),
    convert(userMsg),
  ];

  // Drop messages with an empty payload (e.g. an assistant turn that was
  // stopped/aborted before producing any text) — SiliconFlow rejects such
  // messages with "Message field is required".
  const hasContent = (m) => {
    if (Array.isArray(m.content)) return m.content.length > 0;
    return typeof m.content === "string" && m.content.trim().length > 0;
  };
  const filtered = msgs.filter(hasContent);
  return filtered.length ? filtered : msgs;
}

/** Whether a value is a genuine AbortSignal. Some embedded webviews reject
 *  non-native signal objects when they are passed to `fetch`. */
const isAbortSignal = (value) =>
  !!value &&
  typeof value === "object" &&
  typeof value.addEventListener === "function" &&
  typeof value.aborted === "boolean";

/**
 * Builds the provider-specific fetch request.
 * `ollama` uses the local API; `siliconflow` uses an OpenAI-compatible endpoint.
 */
export function buildChatRequest({ provider, apiKey, model, messages }, signal) {
  const base = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages, stream: true }),
  };
  if (isAbortSignal(signal)) base.signal = signal;

  if (provider === "ollama") {
    return { url: "/ollama/api/chat", options: base };
  }

  return {
    url: "/siliconflow/chat/completions",
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

/** Strips common artifacts some SiliconFlow models emit instead of finishing:
 *  repeated XML declarations (`<?xml version="1.0" encoding="UTF-8"?>`) and
 *  stray `<br>` tags. Applied to the stream so cleaned text also ends up in
 *  history (unclean history amplifies the pattern across turns). */
export function cleanAssistantText(text) {
  if (!text) return text;
  return text
    .replace(/<\?xml[^>]*\?>/gi, "")
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/\n{3,}/g, "\n\n");
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
        onDelta(cleanAssistantText(content));
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
