'use client';

interface BulletCardProps {
  summary: string;
  detail: string;
  onSummaryChange: (value: string) => void;
  onDetailChange: (value: string) => void;
  plusSelected: boolean;
  onPlusClick: () => void;
  plusDisabled?: boolean;
  plusPending?: boolean;
  guideTarget?: boolean;
}

function GuideFinger() {
  return (
    <svg className="first-node-guide-finger" viewBox="0 0 80 80" aria-hidden="true">
      <path d="M37 66 25 53c-4-4 2-10 6-6l5 5V26c0-7 10-7 10 0v17l3-4c4-5 11 0 7 5l-4 6 4-4c5-4 10 3 5 7l-5 5 3-1c6-3 9 5 4 8l-11 8c-7 4-16 2-21-4Z" />
      <path d="M44 18v-7" />
    </svg>
  );
}

export default function BulletCard({
  summary, detail, onSummaryChange, onDetailChange,
  plusSelected, onPlusClick, plusDisabled, plusPending, guideTarget,
}: BulletCardProps) {
  return (
    <div className="bullet-card">
      <div className="bullet-card-row">
        <span
          className="bullet-card-summary"
          contentEditable
          suppressContentEditableWarning
          onBlur={e => {
            const text = (e.target as HTMLElement).textContent || '';
            onSummaryChange(text.replace(/\n/g, ''));
          }}
        >
          {summary}
        </span>
        <span className={guideTarget ? 'first-node-guide-target' : undefined}>
          <button
            className={`plus-btn ${plusSelected ? 'plus-btn-selected' : ''}`}
            onClick={onPlusClick}
            disabled={plusDisabled || plusPending}
          >
            {plusPending ? (
              <span className="plus-spinner" />
            ) : plusSelected ? '✓' : '+'}
          </button>
          {guideTarget && (
            <span className="first-node-guide-tooltip" role="status">
              选一条值得反复回顾的观点，沉淀到脑图
            </span>
          )}
          {guideTarget && <span className="first-node-guide-magnifier" aria-hidden="true" />}
          {guideTarget && <GuideFinger />}
        </span>
      </div>
      <span
        className="bullet-card-detail"
        contentEditable
        suppressContentEditableWarning
        onBlur={e => onDetailChange((e.target as HTMLElement).textContent || '')}
      >
        {detail}
      </span>
    </div>
  );
}
