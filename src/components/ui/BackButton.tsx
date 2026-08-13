'use client';

interface BackButtonProps {
  onClick: () => void;
}

export default function BackButton({ onClick }: BackButtonProps) {
  return (
    <button className="back-btn" onClick={onClick} aria-label="返回">
      {'<'}
    </button>
  );
}
