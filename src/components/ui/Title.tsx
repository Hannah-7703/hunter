'use client';

interface TitleProps {
  value: string;
  onChange: (value: string) => void;
}

export default function Title({ value, onChange }: TitleProps) {
  return (
    <h2
      className="notes-title"
      contentEditable
      suppressContentEditableWarning
      onBlur={e => onChange((e.target as HTMLElement).textContent || '')}
    >
      {value}
    </h2>
  );
}
