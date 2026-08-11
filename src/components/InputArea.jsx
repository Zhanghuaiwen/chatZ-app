import "./InputArea.css";

export default function InputArea({
  input,
  onInputChange,
  onSend,
  onStop,
  onKeyDown,
  isLoading,
  textareaRef,
  autoResize,
}) {
  return (
    <div className="input-area">
      <div className="input-wrapper">
        <div className="input-box">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => {
              onInputChange(e.target.value);
              autoResize();
            }}
            onKeyDown={onKeyDown}
            placeholder="输入消息... (Shift+Enter 换行)"
            rows={1}
          />
          {isLoading ? (
            <button
              className="send-btn stop-btn"
              onClick={onStop}
              title="停止生成"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
            </button>
          ) : (
            <button
              className="send-btn"
              disabled={!input.trim()}
              onClick={() => onSend(input)}
              title="发送"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
