import { renderMarkdown } from "../utils";

export default function ChatWindow({
  messages,
  isLoading,
  settings,
  onQuickAction,
  chatEndRef,
}) {
  return (
    <div className="chat-container">
      {messages.length === 0 ? (
        <div className="welcome">
          <div className="welcome-icon">Z</div>
          <h2>ChatZ</h2>
          <p>
            {settings.provider === "ollama"
              ? "本地 AI 对话 - 完全离线，数据不离开你的电脑"
              : "基于 SiliconFlow 免费模型的 AI 对话助手"}
          </p>
          <div className="quick-actions">
            <button
              className="quick-action"
              onClick={() => onQuickAction("帮我写一个 Python 快速排序算法")}
            >
              写一个快速排序算法
            </button>
            <button
              className="quick-action"
              onClick={() => onQuickAction("用简单的语言解释量子计算")}
            >
              解释量子计算
            </button>
            <button
              className="quick-action"
              onClick={() => onQuickAction("帮我写一首关于春天的现代诗")}
            >
              写一首春天的诗
            </button>
            <button
              className="quick-action"
              onClick={() => onQuickAction("推荐5本值得阅读的科幻小说")}
            >
              推荐科幻小说
            </button>
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
                  __html:
                    msg.role === "assistant"
                      ? renderMarkdown(msg.content) +
                        (isLoading &&
                        i === messages.length - 1 &&
                        msg.content === ""
                          ? '<span class="typing-cursor"></span>'
                          : "")
                      : renderMarkdown(msg.content),
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
        </div>
      )}
    </div>
  );
}
