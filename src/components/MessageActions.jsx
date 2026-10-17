/** Per-message action buttons (copy / edit / regenerate / delete). */
export default function MessageActions({
  role,
  onCopy,
  onEdit,
  onRegenerate,
  onDelete,
  copied,
  disabled,
}) {
  return (
    <div className="message-actions">
      <button className="msg-action" onClick={onCopy} title="复制" aria-label="复制">
        {copied ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6L9 17l-5-5" />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" />
            <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
          </svg>
        )}
      </button>

      {role === "user" && (
        <button
          className="msg-action"
          onClick={onEdit}
          disabled={disabled}
          title="编辑并重新生成"
          aria-label="编辑"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4z" />
          </svg>
        </button>
      )}

      {role === "assistant" && (
        <button
          className="msg-action"
          onClick={onRegenerate}
          disabled={disabled}
          title="重新生成"
          aria-label="重新生成"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M23 4v6h-6M1 20v-6h6" />
            <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
          </svg>
        </button>
      )}

      <button
        className="msg-action"
        onClick={onDelete}
        disabled={disabled}
        title="删除"
        aria-label="删除"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
        </svg>
      </button>
    </div>
  );
}
