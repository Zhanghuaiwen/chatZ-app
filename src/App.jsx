import { useState, useEffect, useRef, useCallback } from "react";
import "./App.css";
import { SYSTEM_PROMPT, PROVIDERS, generateId } from "./constants";
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
      return {
        provider: "ollama",
        apiKey: "",
        model: "deepseek-coder-v2:latest",
      };
    return s;
  });
  const [showSettings, setShowSettings] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    return typeof window !== "undefined" && window.innerWidth > 768;
  });
  const [abortController, setAbortController] = useState(null);
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem("chatz_theme") || "dark";
    } catch {
      return "dark";
    }
  });

  const chatEndRef = useRef(null);
  const chatContainerRef = useRef(null);
  const textareaRef = useRef(null);
  const sendingRef = useRef(false);
  const roundRef = useRef(0);

  const activeConv = conversations.find((c) => c.id === activeId);
  const messages = activeConv?.messages || [];
  const isMobile =
    typeof window !== "undefined" && window.innerWidth <= 768;

  useEffect(() => {
    saveData({ conversations, activeId, settings });
  }, [conversations, activeId, settings]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try {
      localStorage.setItem("chatz_theme", theme);
    } catch {}
  }, [theme]);

  useEffect(() => {
    const el = chatContainerRef.current;
    if (!el) return;
    const threshold = 120;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < threshold) {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
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
    if (isMobile) setSidebarOpen(false);
  };

  const deleteConversation = (id) => {
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (activeId === id) {
      setActiveId(null);
    }
  };

  const sendMessage = async (text) => {
    if (!text?.trim() || isLoading || sendingRef.current) return;

    if (settings.provider === "siliconflow" && !settings.apiKey) {
      setShowSettings(true);
      return;
    }

    sendingRef.current = true;
    const round = ++roundRef.current;

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

    let reader = null;
    const isStale = () => roundRef.current !== round;

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

      reader = res.body.getReader();
      const decoder = new TextDecoder();
      let assistantContent = "";
      let buffer = "";
      let streamEnded = false;

      const appendDelta = (snap) => {
        if (isStale()) return;
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
      };

      const processLine = (raw) => {
        if (isStale()) return false;
        const trimmed = raw.trim();
        if (!trimmed) return true;

        try {
          let line = trimmed;
          if (settings.provider !== "ollama") {
            if (line === "data: [DONE]") return false;
            if (!line.startsWith("data: ")) return true;
            line = line.slice(6);
          }

          const json = JSON.parse(line);
          let delta = "";
          if (settings.provider === "ollama") {
            delta = json.message?.content || "";
          } else {
            if (json.choices?.[0]?.finish_reason === "break") return true;
            delta = json.choices?.[0]?.delta?.content || "";
          }

          if (delta) {
            assistantContent += delta;
            appendDelta(assistantContent);
          }
        } catch {
          // ignore invalid JSON chunks
        }
        return true;
      };

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

      while (!streamEnded) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop();

        for (const line of lines) {
          if (!processLine(line)) {
            streamEnded = true;
            break;
          }
        }
      }

      buffer += decoder.decode();
      if (buffer.trim() && !streamEnded) {
        streamEnded = !processLine(buffer);
      }
    } catch (err) {
      if (err.name !== "AbortError" && !isStale()) {
        setConversations((prev) =>
          prev.map((c) => {
            if (c.id !== convId) return c;
            const msgs = [...c.messages];
            const last = msgs[msgs.length - 1];
            if (last?.role === "assistant") {
              msgs[msgs.length - 1] = {
                ...last,
                content: `${last.content || ""}\n\n错误: ${err.message}`,
              };
            } else {
              msgs.push({ role: "assistant", content: `错误: ${err.message}` });
            }
            return { ...c, messages: msgs };
          }),
        );
      }
    } finally {
      try {
        reader?.cancel();
      } catch {}
      if (roundRef.current === round) sendingRef.current = false;
      setIsLoading(false);
      setAbortController(null);
      console.debug(
        `[ChatZ] Round ${round} response completed, buffer purged.`,
      );
    }
  };

  const stopGeneration = () => {
    abortController?.abort();
    sendingRef.current = false;
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
      {sidebarOpen && isMobile && (
        <div
          className="modal-overlay"
          onClick={() => setSidebarOpen(false)}
          style={{ zIndex: 9 }}
        />
      )}

      <div className={`sidebar-slot ${sidebarOpen ? "open" : "collapsed"}`}>
        <Sidebar
          conversations={conversations}
          activeId={activeId}
          providerLabel={providerLabel}
          modelLabel={modelLabel}
          onNewChat={createNewChat}
          onSelectConversation={(id) => {
            setActiveId(id);
            if (isMobile) setSidebarOpen(false);
          }}
          onDeleteConversation={deleteConversation}
          onSettings={() => setShowSettings(true)}
          onClose={() => setSidebarOpen(false)}
          theme={theme}
          onToggleTheme={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
        />
      </div>

      <main className="main-area">
        <header className="chat-header">
          {!sidebarOpen && (
            <button
              className="chat-header-toggle"
              onClick={() => setSidebarOpen(true)}
              title="打开侧边栏"
            >
              <svg
                width="18"
                height="18"
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
          )}
          <div className="chat-header-title">
            <svg
              className="chat-header-icon"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
            </svg>
            <span className="chat-header-text">
              {activeConv?.title || "新对话"}
            </span>
          </div>
        </header>

        <ChatWindow
          messages={messages}
          isLoading={isLoading}
          settings={settings}
          onQuickAction={handleQuickAction}
          chatEndRef={chatEndRef}
          chatContainerRef={chatContainerRef}
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
