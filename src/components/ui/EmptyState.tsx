interface EmptyStateProps {
  lines: string[];
}

export default function EmptyState({ lines }: EmptyStateProps) {
  return (
    <div className="empty-state">
      {lines.map((line, i) =>
        i === 0 ? (
          <h3 key={i} className="empty-state-heading">{line}</h3>
        ) : (
          <p key={i} className="empty-state-text">{line}</p>
        )
      )}
    </div>
  );
}
