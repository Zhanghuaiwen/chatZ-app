import { useState } from "react";
import { renderMarkdown } from "../utils";
import { variantsOf } from "../utils/messageTree";
import { APP_NAME } from "../constants";
import MessageActions from "./MessageActions";
import BranchNav from "./BranchNav";
import "./ChatWindow.css";

const QUICK_ACTIONS = [
  { label: "写一个快速排序算法", prompt: "帮我写一个 Python 快速排序算法" },
  { label: "解释量子计算", prompt: "用简单的语言解释量子计算" },
  { label: "写一首春天的诗", prompt: "帮我写一首关于春天的现代诗" },
  { label: "推荐科幻小说", prompt: "推荐5本值得阅读的科幻小说" },
];

/** Renders a message to HTML, appending a blinking cursor while the assistant
 *  is still streaming its (still empty) last message. */
function messageHtml(msg, isLoading, isLast) {
  const html = renderMarkdown(msg.content);
  const showCursor =
    isLoading && msg.role === "assistant" && isLast && msg.content === "";
  return showCursor ? html + '<span class="typing-cursor"></span>' : html;
}

/** Formats token/cache stats for the small caption under an assistant reply. */
function formatUsage(usage) {
  const parts = [];
  if (usage.cachedTokens != null) parts.push(`缓存命中 ${usage.cachedTokens}`);
  if (usage.promptTokens != null) parts.push(`提示 ${usage.promptTokens}`);
  if (usage.completionTokens != null) parts.push(`生成 ${usage.completionTokens}`);
  if (!parts.length) return "";
  return `${parts.join(" · ")} tokens`;
}

export default function ChatWindow({
  messages,
  conversation,
  isLoading,
  settings,
  onQuickAction,
  onEditMessage,
  onRegenerate,
  onDeleteMessage,
  onSwitchVariant,
  chatEndRef,
  chatContainerRef,
}) {
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState("");
  const [copiedId, setCopiedId] = useState(null);

  const beginEdit = (msg) => {
    setEditingId(msg.id);
    setDraft(msg.content);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraft("");
  };

  const saveEdit = (msgId) => {
    const text = draft.trim();
    setEditingId(null);
    setDraft("");
    if (text) onEditMessage(msgId, text);
  };

  const copyMessage = async (msg) => {
    try {
      await navigator.clipboard.writeText(msg.content || "");
      setCopiedId(msg.id);
      setTimeout(() => setCopiedId((c) => (c === msg.id ? null : c)), 1200);
    } catch {
      // clipboard unavailable
    }
  };

  return (
    <div className="chat-container" ref={chatContainerRef}>
      {messages.length === 0 ? (
        <div className="welcome">
          <div className="welcome-icon">Z</div>
          <h2>{APP_NAME}</h2>
          <p>
            {settings.provider === "ollama"
              ? "本地 AI 对话 - 完全离线，数据不离开你的电脑"
              : "基于 React + Vite 构建的类 ChatGPT 对话应用"}
          </p>
          <div className="quick-actions">
            {QUICK_ACTIONS.map(({ label, prompt }) => (
              <button
                key={label}
                className="quick-action"
                onClick={() => onQuickAction(prompt)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="messages-wrapper">
          {messages.map((msg, i) => {
            const { index, count, siblings } = variantsOf(conversation, msg.id);
            const isLast = i === messages.length - 1;
            const editing = editingId === msg.id;

            return (
              <div key={msg.id} className="message">
                <div className={`message-avatar ${msg.role}`}>
                  {msg.role === "user" ? "U" : "Z"}
                </div>
                <div className="message-body">
                  {msg.role === "user" && msg.attachments?.length > 0 && (
                    <div className="message-attachments">
                      {msg.attachments.map((att) => (
                        <div
                          key={att.id}
                          className={`message-attachment attachment-${att.type}`}
                        >
                          {att.type === "image" ? (
                            <img src={att.dataUrl} alt={att.name} />
                          ) : (
                            <div className="message-attachment-file">
                              <span className="message-attachment-type">
                                {att.type === "video"
                                  ? "VID"
                                  : att.type === "audio"
                                    ? "AUD"
                                    : "TXT"}
                              </span>
                              <span className="message-attachment-name">
                                {att.name}
                              </span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {editing ? (
                    <div className="message-edit">
                      <textarea
                        className="message-edit-input"
                        value={draft}
                        autoFocus
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            saveEdit(msg.id);
                          } else if (e.key === "Escape") {
                            cancelEdit();
                          }
                        }}
                      />
                      <div className="message-edit-actions">
                        <button
                          className="message-edit-cancel"
                          onClick={cancelEdit}
                        >
                          取消
                        </button>
                        <button
                          className="message-edit-save"
                          onClick={() => saveEdit(msg.id)}
                        >
                          保存并重新生成
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div
                        className="message-content"
                        dangerouslySetInnerHTML={{
                          __html: messageHtml(msg, isLoading, isLast),
                        }}
                      />
                      {msg.role === "assistant" && msg.usage && (
                        <div className="message-usage">
                          {formatUsage(msg.usage)}
                        </div>
                      )}
                    </>
                  )}

                  <div className="message-toolbar">
                    <MessageActions
                      role={msg.role}
                      copied={copiedId === msg.id}
                      disabled={isLoading}
                      onCopy={() => copyMessage(msg)}
                      onEdit={() => beginEdit(msg)}
                      onRegenerate={() => onRegenerate(msg.id)}
                      onDelete={() => onDeleteMessage(msg.id)}
                    />
                    <BranchNav
                      index={index}
                      count={count}
                      onPrev={() =>
                        siblings[index - 1] &&
                        onSwitchVariant(siblings[index - 1].id)
                      }
                      onNext={() =>
                        siblings[index + 1] &&
                        onSwitchVariant(siblings[index + 1].id)
                      }
                    />
                  </div>
                </div>
              </div>
            );
          })}
          {isLoading && messages[messages.length - 1]?.role !== "assistant" && (
            <div className="message">
              <div className="message-avatar assistant">Z</div>
              <div className="message-content">
                <div className="loading-dots">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
          <div className="chat-spacer" />
        </div>
      )}
    </div>
  );
}
