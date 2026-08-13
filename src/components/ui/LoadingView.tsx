interface LoadingViewProps {
  text?: string;
}

export default function LoadingView({ text = "Hunter 正在整理灵感…" }: LoadingViewProps) {
  return (
    <div className="loading-view">
      <div className="loading-dots">
        <span className="loading-dot" />
        <span className="loading-dot" />
        <span className="loading-dot" />
      </div>
      <p className="loading-text">{text}</p>
    </div>
  );
}
