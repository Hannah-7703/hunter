'use client';

interface TextInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  maxLength?: number;
}

export default function TextInput({ value, onChange, placeholder = '写下你一闪而过的想法…', maxLength = 3000 }: TextInputProps) {
  return (
    <textarea
      className="text-input"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      maxLength={maxLength}
      autoFocus
    />
  );
}
