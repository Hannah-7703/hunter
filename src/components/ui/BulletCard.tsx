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
}

export default function BulletCard({
  summary, detail, onSummaryChange, onDetailChange,
  plusSelected, onPlusClick, plusDisabled, plusPending,
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
        <button
          className={`plus-btn ${plusSelected ? 'plus-btn-selected' : ''}`}
          onClick={onPlusClick}
          disabled={plusDisabled || plusPending}
        >
          {plusPending ? (
            <span className="plus-spinner" />
          ) : plusSelected ? '✓' : '+'}
        </button>
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
