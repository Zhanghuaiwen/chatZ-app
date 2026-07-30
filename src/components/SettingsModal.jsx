import { useState } from "react";
import { PROVIDERS } from "../constants";

export default function SettingsModal({ settings, onSave, onClose }) {
  const [provider, setProvider] = useState(settings.provider || "ollama");
  const [apiKey, setApiKey] = useState(settings.apiKey || "");
  const [testStatus, setTestStatus] = useState(null);
  const [testMsg, setTestMsg] = useState("");

  const currentModels = PROVIDERS[provider]?.models || [];
  const [model, setModel] = useState(() => {
    const models = PROVIDERS[settings.provider]?.models || [];
    return models.find((m) => m.id === settings.model)
      ? settings.model
      : models[0]?.id || "";
  });

  const handleTest = async () => {
    setTestStatus("testing");
    setTestMsg("");

    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 10000);
      const res = await fetch("/ollama/api/tags", { signal: ctrl.signal });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const models = (data.models || []).map((m) => m.name);
      setTestStatus("ok");
      setTestMsg(`连接成功！可用模型: ${models.join(", ") || "(无模型)"}`);
    } catch (e) {
      setTestStatus("error");
      setTestMsg(
        `连接失败: ${e.name === "AbortError" ? "超时(10s)" : e.message}`,
      );
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>设置</h3>
        <div className="form-group">
          <label>AI 来源</label>
          <select
            value={provider}
            onChange={(e) => {
              const p = e.target.value;
              setProvider(p);
              const first = PROVIDERS[p]?.models[0]?.id || "";
              setModel(first);
              setTestStatus(null);
              setTestMsg("");
            }}
          >
            <option value="ollama">本地 Ollama（无需联网）</option>
            <option value="siliconflow">SiliconFlow 云 API</option>
          </select>
        </div>

        {provider === "siliconflow" && (
          <div className="form-group">
            <label>API Key</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="输入 SiliconFlow API Key"
            />
            <div className="form-hint">
              前往{" "}
              <a
                href="https://cloud.siliconflow.cn/account/ak"
                target="_blank"
                rel="noreferrer"
              >
                SiliconFlow
              </a>{" "}
              免费注册获取
            </div>
          </div>
        )}

        <div className="form-group">
          <label>模型</label>
          <select
            key={provider}
            value={
              currentModels.find((m) => m.id === model)
                ? model
                : currentModels[0]?.id
            }
            onChange={(e) => setModel(e.target.value)}
          >
            {currentModels.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>

        {provider === "ollama" && (
          <>
            <div className="form-hint">
              模型存储在默认位置 (~/.ollama/models)，通过本地 Ollama
              运行，完全离线可用
            </div>
            <div style={{ marginTop: 12 }}>
              <button
                className="btn btn-ghost"
                onClick={handleTest}
                disabled={testStatus === "testing"}
              >
                {testStatus === "testing" ? "检测中..." : "测试连接"}
              </button>
              {testMsg && (
                <div
                  className="form-hint"
                  style={{
                    marginTop: 6,
                    color: testStatus === "ok" ? "#4ade80" : "#f87171",
                  }}
                >
                  {testMsg}
                </div>
              )}
            </div>
          </>
        )}

        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onClose}>
            取消
          </button>
          <button
            className="btn btn-primary"
            onClick={() =>
              onSave({ provider, apiKey, model: model || currentModels[0]?.id })
            }
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
