/** Variant switcher shown under a message that has sibling branches. */
export default function BranchNav({ index, count, onPrev, onNext }) {
  if (count <= 1) return null;
  return (
    <div className="branch-nav" title={`分支 ${index + 1}/${count}`}>
      <button
        className="branch-btn"
        onClick={onPrev}
        disabled={index <= 0}
        aria-label="上一个分支"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </button>
      <span className="branch-count">
        {index + 1}/{count}
      </span>
      <button
        className="branch-btn"
        onClick={onNext}
        disabled={index >= count - 1}
        aria-label="下一个分支"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 18l6-6-6-6" />
        </svg>
      </button>
    </div>
  );
}
