import { useRef } from "react";
import "./InputArea.css";

const ACCEPT =
  "image/*,video/*,audio/*,.txt,.md,.js,.jsx,.ts,.tsx,.py,.json,.css,.html,.csv,.log,.yml,.yaml";

export default function InputArea({
  input,
  onInputChange,
  onSend,
  onStop,
  onKeyDown,
  isLoading,
  textareaRef,
  autoResize,
  attachments,
  onAddAttachments,
  onRemoveAttachment,
}) {
  const fileInputRef = useRef(null);

  return (
    <div className="input-area">
      <div className="input-wrapper">
        <div className="input-box">
          {attachments.length > 0 && (
            <div className="input-attachments">
              {attachments.map((att) => (
                <div
                  key={att.id}
                  className={`input-attachment attachment-${att.type}`}
                >
                  {att.type === "image" && (
                    <img
                      className="input-attachment-thumb"
                      src={att.dataUrl}
                      alt={att.name}
                    />
                  )}
                  {att.type !== "image" && (
                    <span className="input-attachment-name">{att.name}</span>
                  )}
                  <button
                    className="input-attachment-remove"
                    onClick={() => onRemoveAttachment(att.id)}
                    title="移除"
                    aria-label="移除附件"
                  >
                    <svg
                      width="10"
                      height="10"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                    >
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
          <button
            className="attach-btn"
            onClick={() => fileInputRef.current?.click()}
            title="上传图片、视频、音频或文本文件"
            aria-label="添加附件"
            disabled={isLoading}
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
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            hidden
            accept={ACCEPT}
            onChange={(e) => {
              onAddAttachments(e.target.files);
              e.target.value = "";
            }}
          />
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
              disabled={!input.trim() && attachments.length === 0}
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
