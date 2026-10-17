/**
 * Client-side chat transport. Message/context construction and provider
 * parameters now live on the local server (`/api/llm/chat`); the client only
 * builds the proxy request and parses the streamed SSE response.
 */

/** Builds the request to the local backend's streaming chat proxy. */
export function buildLlmRequest(
  { provider, model, apiKey, conversationId, history, message },
  signal,
) {
  const options = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      provider,
      model,
      apiKey,
      conversationId,
      history,
      message,
    }),
  };
  if (signal) options.signal = signal;
  return { url: "/api/llm/chat", options };
}

/** Strips common artifacts some models emit instead of finishing:
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
 * Accumulated assistant text is reported via `onDelta`; token/cache statistics
 * (the trailing `chatz_usage` event) via `onUsage`.
 */
export function createStreamParser({ provider, onDelta, onUsage }) {
  let content = "";

  return (raw) => {
    const trimmed = raw.trim();
    if (!trimmed) return true;

    let line = trimmed;
    if (line.startsWith("data:")) line = line.slice(5).trim();
    if (line === "[DONE]") return false;

    try {
      const json = JSON.parse(line);

      if (json.chatz_usage) {
        onUsage?.(json.chatz_usage);
        return true;
      }

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
