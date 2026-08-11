import { renderMarkdown } from "../utils";
import { APP_NAME } from "../constants";
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

export default function ChatWindow({
  messages,
  isLoading,
  settings,
  onQuickAction,
  chatEndRef,
  chatContainerRef,
}) {
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
          {messages.map((msg, i) => (
            <div key={i} className="message">
              <div className={`message-avatar ${msg.role}`}>
                {msg.role === "user" ? "U" : "Z"}
              </div>
              <div
                className="message-content"
                dangerouslySetInnerHTML={{
                  __html: messageHtml(msg, isLoading, i === messages.length - 1),
                }}
              />
            </div>
          ))}
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
