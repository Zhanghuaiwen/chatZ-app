import { useState, useEffect, useRef, useCallback } from "react";
import "./App.css";
import { DEFAULT_SETTINGS, PROVIDERS, generateId } from "./constants";
import { loadData, saveData } from "./utils";
import {
  buildAllMessages,
  buildChatRequest,
  createStreamParser,
  consumeStream,
  readApiError,
} from "./services/chat";
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
  const [settings, setSettings] = useState(() =>
    saved?.settings?.provider ? saved.settings : DEFAULT_SETTINGS,
  );
  const [showSettings, setShowSettings] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    return typeof window !== "undefined" && window.innerWidth > 768;
  });
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
  const abortRef = useRef(null);
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

  /** Applies `mutate` to the conversation with the given id, via state updater. */
  const updateConversation = (id, mutate) => {
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? mutate(c) : c)),
    );
  };

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

  /** Returns the active conversation id, creating a new conversation if needed. */
  const ensureConversation = (text) => {
    if (activeId) return activeId;
    const id = generateId();
    setConversations((prev) => [
      { id, title: text.slice(0, 30), messages: [] },
      ...prev,
    ]);
    setActiveId(id);
    return id;
  };

  /** Renders an error into the last assistant message, or appends a new one. */
  const reportError = (convId, err) => {
    updateConversation(convId, (c) => {
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
    });
  };

  const sendMessage = async (text) => {
    if (!text?.trim() || isLoading || sendingRef.current) return;

    if (settings.provider === "siliconflow" && !settings.apiKey) {
      setShowSettings(true);
      return;
    }

    sendingRef.current = true;
    const round = ++roundRef.current;
    const convId = ensureConversation(text);

    const userMsg = { role: "user", content: text.trim() };
    updateConversation(convId, (c) => ({
      ...c,
      title: c.messages.length === 0 ? text.slice(0, 30) : c.title,
      messages: [...c.messages, userMsg],
    }));
    setInput("");
    setIsLoading(true);

    const controller = new AbortController();
    abortRef.current = controller;
    const isStale = () => roundRef.current !== round;

    let reader = null;

    try {
      const history = conversations.find((c) => c.id === convId)?.messages || [];
      const allMessages = buildAllMessages(history, userMsg);
      const { url, options } = buildChatRequest(settings, allMessages, controller.signal);

      const res = await fetch(url, options);
      if (!res.ok) throw new Error(await readApiError(res));

      const parser = createStreamParser({
        provider: settings.provider,
        onDelta: (content) => {
          if (isStale()) return;
          updateConversation(convId, (c) => ({
            ...c,
            messages: [
              ...c.messages.slice(0, -1),
              { role: "assistant", content },
            ],
          }));
        },
      });

      // Placeholder assistant message updated as stream deltas arrive.
      updateConversation(convId, (c) => ({
        ...c,
        messages: [...c.messages, { role: "assistant", content: "" }],
      }));

      reader = res.body.getReader();
      await consumeStream(reader, parser, isStale);
    } catch (err) {
      if (err.name !== "AbortError" && !isStale()) {
        reportError(convId, err);
      }
    } finally {
      try {
        reader?.cancel();
      } catch {}
      if (roundRef.current === round) sendingRef.current = false;
      setIsLoading(false);
      abortRef.current = null;
    }
  };

  const stopGeneration = () => {
    abortRef.current?.abort();
    sendingRef.current = false;
    setIsLoading(false);
    abortRef.current = null;
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

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
              className="icon-btn chat-header-toggle"
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
          onQuickAction={sendMessage}
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
