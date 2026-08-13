'use client';

import { useEffect, useRef, useState } from 'react';

interface TranscriptReviewInputProps {
  value: string;
  onChange: (value: string) => void;
  maxLength: number;
}

export default function TranscriptReviewInput({ value, onChange, maxLength }: TranscriptReviewInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const hideScrollbarTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isScrolling, setIsScrolling] = useState(false);

  useEffect(() => () => {
    if (hideScrollbarTimer.current) clearTimeout(hideScrollbarTimer.current);
  }, []);

  function focusText() {
    textareaRef.current?.focus();
  }

  function handleScroll() {
    setIsScrolling(true);
    if (hideScrollbarTimer.current) clearTimeout(hideScrollbarTimer.current);
    hideScrollbarTimer.current = setTimeout(() => setIsScrolling(false), 700);
  }

  return (
    <div className="transcript-review-editor" onClick={focusText}>
      <textarea
        ref={textareaRef}
        className={`text-input transcript-review-input${isScrolling ? ' is-scrolling' : ''}`}
        value={value}
        onChange={event => onChange(event.target.value)}
        onScroll={handleScroll}
        maxLength={maxLength}
      />
    </div>
  );
}
