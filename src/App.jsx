import { useState, useEffect, useRef, useCallback } from "react";
import "./App.css";
import { DEFAULT_SETTINGS, PROVIDERS, generateId } from "./constants";
import { readFileAsDataURL, readFileAsText } from "./utils";
import { loadState, saveState } from "./store/api";
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
  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
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
  const hydratedRef = useRef(false);
  const lastPersistedRef = useRef(null);

  const activeConv = conversations.find((c) => c.id === activeId);
  const messages = activeConv?.messages || [];
  const isMobile =
    typeof window !== "undefined" && window.innerWidth <= 768;

  useEffect(() => {
    let cancelled = false;
    loadState()
      .then((state) => {
        if (cancelled) return;
        setConversations(state.conversations || []);
        setActiveId(state.activeId || null);
        if (state.settings?.provider) setSettings(state.settings);
        lastPersistedRef.current = JSON.stringify({
          conversations: state.conversations || [],
          activeId: state.activeId || null,
          settings: state.settings?.provider ? state.settings : DEFAULT_SETTINGS,
        });
      })
      .catch((err) => {
        console.error("加载本地数据失败:", err);
      })
      .finally(() => {
        if (!cancelled) hydratedRef.current = true;
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hydratedRef.current) return;
    const snapshot = { conversations, activeId, settings };
    const json = JSON.stringify(snapshot);
    if (json === lastPersistedRef.current) return;
    lastPersistedRef.current = json;
    saveState(snapshot);
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
    setAttachments([]);
    if (isMobile) setSidebarOpen(false);
  };

  const MAX_ATTACHMENTS = 5;

  /** Reads selected files into attachment objects (image/video/audio/text). */
  const handleAddAttachments = async (files) => {
    const list = Array.from(files || []);
    if (!list.length) return;

    const items = [];
    for (const file of list) {
      const isImage = file.type.startsWith("image/");
      const isVideo = file.type.startsWith("video/");
      const isAudio = file.type.startsWith("audio/");
      const ext = file.name.split(".").pop()?.toLowerCase();
      const isText =
        file.type.startsWith("text/") ||
        [
          "txt", "md", "js", "jsx", "ts", "tsx", "py", "json",
          "css", "html", "csv", "log", "yml", "yaml",
        ].includes(ext);

      let item = null;
      if (isImage) {
        item = { type: "image", name: file.name, dataUrl: await readFileAsDataURL(file) };
      } else if (isVideo) {
        item = { type: "video", name: file.name, dataUrl: await readFileAsDataURL(file) };
      } else if (isAudio) {
        item = { type: "audio", name: file.name, dataUrl: await readFileAsDataURL(file) };
      } else if (isText) {
        item = { type: "text", name: file.name, text: await readFileAsText(file) };
      }
      if (item) items.push({ id: generateId(), ...item });
    }
    if (!items.length) return;

    setAttachments((prev) => {
      const room = Math.max(0, MAX_ATTACHMENTS - prev.length);
      return [...prev, ...items.slice(0, room)];
    });
  };

  const removeAttachment = (id) =>
    setAttachments((prev) => prev.filter((a) => a.id !== id));

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
    const title = text.trim() || attachments[0]?.name || "新对话";
    setConversations((prev) => [
      { id, title: title.slice(0, 30), messages: [] },
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
    if (
      (!text?.trim() && attachments.length === 0) ||
      isLoading ||
      sendingRef.current
    ) {
      return;
    }

    if (settings.provider === "siliconflow" && !settings.apiKey) {
      setShowSettings(true);
      return;
    }

    sendingRef.current = true;
    const round = ++roundRef.current;
    const convId = ensureConversation(text);

    const userMsg = {
      role: "user",
      content: text.trim(),
      ...(attachments.length ? { attachments } : {}),
    };
    const title = text.trim() || attachments[0]?.name || "新对话";
    updateConversation(convId, (c) => ({
      ...c,
      title: c.messages.length === 0 ? title.slice(0, 30) : c.title,
      messages: [...c.messages, userMsg],
    }));
    setAttachments([]);
    setInput("");
    setIsLoading(true);

    const controller = new AbortController();
    abortRef.current = controller;
    const isStale = () => roundRef.current !== round;

    let reader = null;

    try {
      const history = conversations.find((c) => c.id === convId)?.messages || [];
      const allMessages = buildAllMessages(history, userMsg, settings.provider);
      const requestParams = { ...settings, messages: allMessages };
      const { url, options } = buildChatRequest(requestParams, controller.signal);

      let res;
      try {
        res = await fetch(url, options);
      } catch (err) {
        // Some embedded webviews / older engines reject the AbortSignal when
        // converting RequestInit. Retry once without a signal so the request
        // can still go through (stop-generation then simply won't abort it).
        if (String(err?.message).includes("AbortSignal")) {
          const fallback = buildChatRequest(requestParams, undefined);
          res = await fetch(fallback.url, fallback.options);
        } else {
          throw err;
        }
      }
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
          attachments={attachments}
          onAddAttachments={handleAddAttachments}
          onRemoveAttachment={removeAttachment}
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
