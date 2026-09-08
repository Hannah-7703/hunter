'use client';

import { useEffect, useRef } from 'react';

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
  autoFocusSummary?: boolean;
  onEmptyBlur?: () => void;
}

export default function BulletCard({
  summary, detail, onSummaryChange, onDetailChange,
  plusSelected, onPlusClick, plusDisabled, plusPending, guideTarget,
  autoFocusSummary, onEmptyBlur,
}: BulletCardProps) {
  const summaryRef = useRef<HTMLSpanElement>(null);
  const detailRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (autoFocusSummary) summaryRef.current?.focus();
  }, [autoFocusSummary]);

  return (
    <div
      className="bullet-card"
      onBlur={event => {
        if (!onEmptyBlur) return;
        const nextTarget = event.relatedTarget as Node | null;
        if (nextTarget && event.currentTarget.contains(nextTarget)) return;
        const currentSummary = summaryRef.current?.textContent?.trim() ?? '';
        const currentDetail = detailRef.current?.textContent?.trim() ?? '';
        if (!currentSummary && !currentDetail) onEmptyBlur();
      }}
    >
      <div className="bullet-card-row">
        <span
          ref={summaryRef}
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
        <span
          className={guideTarget ? 'first-node-guide-target' : undefined}
          data-first-node-guide-target={guideTarget ? 'true' : undefined}
        >
          <button
            className={`plus-btn ${plusSelected ? 'plus-btn-selected' : ''}`}
            onClick={onPlusClick}
            disabled={plusDisabled || plusPending}
          >
            {plusPending ? (
              <span className="plus-spinner" />
            ) : plusSelected ? '✓' : '+'}
          </button>
          {guideTarget && <span className="first-node-guide-magnifier" aria-hidden="true" />}
        </span>
      </div>
      <span
        ref={detailRef}
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
