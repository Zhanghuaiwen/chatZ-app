export const STORAGE_KEY = "chatz_data";
export const SYSTEM_PROMPT =
  "You are a helpful assistant. Answer concisely and clearly. When writing code, use markdown code blocks with the appropriate language tag.";

export const PROVIDERS = {
  ollama: {
    name: "本地 Ollama",
    models: [{ id: "qwen2.5:7b", name: "Qwen2.5 7B (本地)" }],
  },
  siliconflow: {
    name: "SiliconFlow 云",
    models: [
      { id: "Qwen/Qwen3-8B", name: "Qwen3 8B (免费)" },
      {
        id: "deepseek-ai/DeepSeek-R1-Distill-Qwen-7B",
        name: "DeepSeek R1 7B (免费)",
      },
      { id: "Qwen/Qwen2.5-7B-Instruct", name: "Qwen2.5 7B (免费)" },
    ],
  },
};

export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}
