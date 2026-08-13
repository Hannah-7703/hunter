interface RecordingIndicatorProps {
  isRecording: boolean;
  isPaused: boolean;
  elapsed: string;
  onClick: () => void;
}

export default function RecordingIndicator({ isRecording, isPaused, elapsed, onClick }: RecordingIndicatorProps) {
  return (
    <div className="recording-indicator">
      <span className="recording-timer">{elapsed}</span>
      <button
        className={`recording-btn ${isRecording && !isPaused ? 'recording-btn-active' : ''} ${isPaused ? 'recording-btn-paused' : ''}`}
        onClick={onClick}
        aria-label={isRecording ? (isPaused ? '继续录音' : '暂停录音') : '开始录音'}
      />
      <span className="recording-hint">
        {!isRecording ? '点击开始录音' : isPaused ? '点击继续录音' : '点击暂停录音'}
      </span>
    </div>
  );
}
