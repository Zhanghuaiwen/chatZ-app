import { useState, useEffect, useRef, useCallback } from "react";
import "./App.css";
import { STORAGE_KEY, SYSTEM_PROMPT, PROVIDERS, generateId } from "./constants";
import { loadData, saveData } from "./utils";
import SettingsModal from "./components/SettingsModal";
import Sidebar from "./components/Sidebar";
import ChatWindow from "./components/ChatWindow";
import InputArea from "./components/InputArea";

export default function App() {
  const saved = loadData();
  const [conversations, setConversations] = useState(
    saved?.conversations || [],
  );
  const [activeId, setActiveId] = useState(saved?.activeId || null);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [settings, setSettings] = useState(() => {
    const s = saved?.settings;
    if (!s || !s.provider)
      return { provider: "ollama", apiKey: "", model: "qwen2.5:7b" };
    return s;
  });
  const [showSettings, setShowSettings] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [abortController, setAbortController] = useState(null);

  const chatEndRef = useRef(null);
  const textareaRef = useRef(null);

  const activeConv = conversations.find((c) => c.id === activeId);
  const messages = activeConv?.messages || [];

  useEffect(() => {
    saveData({ conversations, activeId, settings });
  }, [conversations, activeId, settings]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  });

  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 200) + "px";
    }
  }, []);

  const createNewChat = () => {
    const id = generateId();
    setConversations((prev) => [
      { id, title: "新对话", messages: [] },
      ...prev,
    ]);
    setActiveId(id);
    setSidebarOpen(false);
  };

  const deleteConversation = (id) => {
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (activeId === id) {
      setActiveId(null);
    }
  };

  const sendMessage = async (text) => {
    if (!text?.trim() || isLoading) return;

    if (settings.provider === "siliconflow" && !settings.apiKey) {
      setShowSettings(true);
      return;
    }

    let convId = activeId;
    if (!convId) {
      convId = generateId();
      setConversations((prev) => [
        { id: convId, title: text.slice(0, 30), messages: [] },
        ...prev,
      ]);
      setActiveId(convId);
    }

    const userMsg = { role: "user", content: text.trim() };

    setConversations((prev) =>
      prev.map((c) =>
        c.id === convId
          ? {
              ...c,
              title: c.messages.length === 0 ? text.slice(0, 30) : c.title,
              messages: [...c.messages, userMsg],
            }
          : c,
      ),
    );
    setInput("");
    setIsLoading(true);

    const controller = new AbortController();
    setAbortController(controller);

    try {
      const currentConv = conversations.find((c) => c.id === convId) || {
        messages: [],
      };
      const allMessages = [
        { role: "system", content: SYSTEM_PROMPT },
        ...currentConv.messages,
        userMsg,
      ];

      let res;
      if (settings.provider === "ollama") {
        res = await fetch("/ollama/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: settings.model,
            messages: allMessages,
            stream: true,
          }),
          signal: controller.signal,
        });
      } else {
        res = await fetch("/api/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${settings.apiKey}`,
          },
          body: JSON.stringify({
            model: settings.model,
            messages: allMessages,
            stream: true,
            temperature: 0.7,
            max_tokens: 2048,
          }),
          signal: controller.signal,
        });
      }

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const msg =
          typeof err.error === "string"
            ? err.error
            : err.error?.message || err.message;
        throw new Error(msg || `请求失败 (${res.status})`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let assistantContent = "";
      let buffer = "";

      setConversations((prev) =>
        prev.map((c) =>
          c.id === convId
            ? {
                ...c,
                messages: [...c.messages, { role: "assistant", content: "" }],
              }
            : c,
        ),
      );

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop();

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          try {
            const json = JSON.parse(trimmed);
            let delta = "";
            if (settings.provider === "ollama") {
              delta = json.message?.content || "";
            } else {
              if (json.choices?.[0]?.finish_reason === "break") continue;
              delta = json.choices?.[0]?.delta?.content || "";
            }

            if (delta) {
              assistantContent += delta;
              const snap = assistantContent;
              setConversations((prev) =>
                prev.map((c) =>
                  c.id === convId
                    ? {
                        ...c,
                        messages: [
                          ...c.messages.slice(0, -1),
                          { role: "assistant", content: snap },
                        ],
                      }
                    : c,
                ),
              );
            }
          } catch {
            // ignore invalid JSON chunks
          }
        }
      }
    } catch (err) {
      if (err.name !== "AbortError") {
        setConversations((prev) =>
          prev.map((c) =>
            c.id === convId
              ? {
                  ...c,
                  messages: [
                    ...c.messages,
                    { role: "assistant", content: `错误: ${err.message}` },
                  ],
                }
              : c,
          ),
        );
      }
    } finally {
      setIsLoading(false);
      setAbortController(null);
    }
  };

  const stopGeneration = () => {
    abortController?.abort();
    setIsLoading(false);
    setAbortController(null);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const handleQuickAction = (text) => sendMessage(text);

  const providerLabel =
    settings.provider === "ollama" ? "本地 Ollama" : "SiliconFlow";
  const modelLabel =
    PROVIDERS[settings.provider]?.models.find((m) => m.id === settings.model)
      ?.name || settings.model;

  return (
    <div className="app">
      {sidebarOpen && (
        <div
          className="modal-overlay"
          onClick={() => setSidebarOpen(false)}
          style={{ zIndex: 9 }}
        />
      )}

      <Sidebar
        conversations={conversations}
        activeId={activeId}
        providerLabel={providerLabel}
        modelLabel={modelLabel}
        onNewChat={createNewChat}
        onSelectConversation={(id) => {
          setActiveId(id);
          setSidebarOpen(false);
        }}
        onDeleteConversation={deleteConversation}
        onSettings={() => setShowSettings(true)}
        onClose={() => setSidebarOpen(false)}
        sidebarOpen={sidebarOpen}
      />

      <main className="main-area">
        <button
          className="mobile-sidebar-toggle"
          onClick={() => setSidebarOpen(true)}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 12h18M3 6h18M3 18h18" />
          </svg>
        </button>

        <ChatWindow
          messages={messages}
          isLoading={isLoading}
          settings={settings}
          onQuickAction={handleQuickAction}
          chatEndRef={chatEndRef}
        />

        <InputArea
          input={input}
          onInputChange={setInput}
          onSend={sendMessage}
          onStop={stopGeneration}
          onKeyDown={handleKeyDown}
          isLoading={isLoading}
          textareaRef={textareaRef}
          autoResize={autoResize}
        />
      </main>

      {showSettings && (
        <SettingsModal
          settings={settings}
          onSave={(s) => {
            setSettings(s);
            setShowSettings(false);
          }}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}
