interface AudioBarProps {
  duration: string;
}

export default function AudioBar({ duration }: AudioBarProps) {
  return (
    <div className="audio-bar">
      <button className="audio-play-btn" aria-label="播放">
        <span className="audio-play-icon" />
      </button>
      <div className="audio-progress">
        <div className="audio-progress-line" />
      </div>
      <span className="audio-duration">{duration}</span>
    </div>
  );
}
