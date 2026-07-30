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
      {
        id: "deepseek-ai/DeepSeek-V4-Pro",
        name: "deepseek-ai/DeepSeek-V4-Pro（付费",
      },
      { id: "tencent/Hunyuan-MT-7B", name: "腾讯混元翻译" },
      { id: "deepseek-ai/DeepSeek-OCR", name: "DeepSeek OCR" },
    ],
  },
};

export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}
