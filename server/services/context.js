import crypto from "node:crypto";
import { buildAllMessages } from "./providers.js";

/**
 * Builds the message list for a turn and a stable cache key.
 *
 * The cache key is intentionally derived from conversation-level, turn-stable
 * inputs (provider + model + conversation id) rather than the growing message
 * list, so consecutive turns of the same conversation map to the same cache
 * bucket and route to the same cache. Prefix reuse itself happens token-by-token
 * on the provider side as long as the prefix stays byte-stable.
 */
export function buildContext({
  provider,
  model,
  conversationId,
  history,
  message,
  systemPrompt,
}) {
  const messages = buildAllMessages(history, message, provider, systemPrompt);
  const cacheKey = hashCacheKey([provider, model, conversationId || "anon"]);
  return { messages, cacheKey };
}

function hashCacheKey(parts) {
  const h = crypto.createHash("sha256");
  h.update(parts.join("\u0000"));
  return h.digest("hex").slice(0, 24);
}

/** Normalises provider usage payloads into a common shape. */
function normalizeUsage(usage) {
  const cached =
    usage.prompt_tokens_details?.cached_tokens ??
    usage.cached_tokens ??
    null;
  return {
    promptTokens: usage.prompt_tokens ?? null,
    completionTokens: usage.completion_tokens ?? null,
    totalTokens: usage.total_tokens ?? null,
    cachedTokens: cached,
  };
}

/**
 * Extracts token usage from a single streamed line. Returns a normalised usage
 * object, or null when the line carries none.
 */
export function extractUsage(line, provider) {
  let json;
  try {
    json = JSON.parse(line);
  } catch {
    return null;
  }
  if (!json || typeof json !== "object") return null;

  if (provider === "ollama") {
    if (json.done !== true) return null;
    const usage = normalizeUsage({
      prompt_tokens: json.prompt_eval_count,
      completion_tokens: json.eval_count,
    });
    if (usage.promptTokens == null && usage.completionTokens == null) {
      return null;
    }
    return usage;
  }

  if (json.usage && typeof json.usage === "object") {
    return normalizeUsage(json.usage);
  }
  return null;
}
