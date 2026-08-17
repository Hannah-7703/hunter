'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import BottomNav from '@/components/ui/BottomNav';
import RecordingIndicator from '@/components/ui/RecordingIndicator';
import TextInput from '@/components/ui/TextInput';
import TranscriptReviewInput from '@/components/ui/TranscriptReviewInput';
import Button from '@/components/ui/Button';
import BackButton from '@/components/ui/BackButton';
import LoadingView from '@/components/ui/LoadingView';
import { showToast } from '@/components/ui/Toast';
import { processPhaseA } from '@/lib/deepseek';
import { createNote } from '@/lib/store';
import { startRecognition } from '@/lib/recorder';
import { upsertCachedNote } from '@/lib/clientDataCache';

const DRAFT_KEY = 'hunter_draft';
const MAX_LENGTH = 3000;

type PageState = 'split' | 'recording' | 'editing' | 'transcriptReview' | 'processing';

export default function CapturePage() {
  const router = useRouter();
  const [pageState, setPageState] = useState<PageState>('split');
  const [text, setText] = useState(() => {
    if (typeof window === 'undefined') return '';
    try {
      const draft = localStorage.getItem(DRAFT_KEY);
      if (draft) {
        localStorage.removeItem(DRAFT_KEY);
        return draft.length > MAX_LENGTH ? draft.slice(0, MAX_LENGTH) : draft;
      }
    } catch { /* ignore */ }
    return '';
  });
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [voiceSupported] = useState(() => {
    if (typeof window === 'undefined') return true;
    return 'SpeechRecognition' in (window as unknown as Record<string, unknown>) ||
           'webkitSpeechRecognition' in (window as unknown as Record<string, unknown>);
  });
  const recorderRef = useRef<ReturnType<typeof startRecognition> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const transcriptRef = useRef('');
  const stoppingManually = useRef(false);

  function clearDraft() {
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
  }

  function saveDraft(content: string) {
    try { localStorage.setItem(DRAFT_KEY, content); } catch { /* ignore */ }
  }

  // ===== Recording =====

  function startRecording() {
    stoppingManually.current = false;
    setPageState('recording');
    setIsRecording(true);
    setIsPaused(false);
    setElapsed(0);
    transcriptRef.current = '';

    recorderRef.current = startRecognition('zh-CN', {
      onResult: (t) => { transcriptRef.current = t; },
      onError: (err) => {
        if (stoppingManually.current) return;
        showToast(err, 'error');
        setIsRecording(false);
        setPageState('split');
      },
      onSilence: () => {
        showToast('录音已达 5 分钟上限', 'error');
        setIsRecording(false);
        if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      },
      onMaxDuration: (finalText: string) => {
        setIsRecording(false);
        if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
        openTranscriptReview(finalText);
      },
    });

    timerRef.current = setInterval(() => {
      setElapsed(prev => prev + 1);
    }, 1000);
  }

  function togglePause() {
    if (!recorderRef.current) return;
    if (!isRecording && !isPaused) {
      startRecording();
      return;
    }
    if (isPaused) {
      recorderRef.current.resume();
      setIsPaused(false);
      timerRef.current = setInterval(() => {
        setElapsed(prev => prev + 1);
      }, 1000);
    } else {
      recorderRef.current.pause();
      setIsPaused(true);
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    }
  }

  async function stopRecording() {
    if (stoppingManually.current) return;
    stoppingManually.current = true;
    const finalTranscript = await recorderRef.current?.stop();
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    const transcript = (finalTranscript ?? transcriptRef.current).trim();
    if (!transcript) {
      setIsRecording(false);
      setElapsed(0);
      showToast('未检测到有效声音', 'error');
      return;
    }
    setIsRecording(false);
    openTranscriptReview(transcript);
  }

  function openTranscriptReview(transcript: string) {
    setText(transcript);
    transcriptRef.current = transcript;
    setPageState('transcriptReview');
  }

  function formatTime(sec: number): string {
    const m = Math.floor(sec / 60).toString().padStart(2, '0');
    const s = (sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  // ===== Text editing =====

  function handleTextChange(value: string) {
    if (value.length > MAX_LENGTH) {
      value = value.slice(0, MAX_LENGTH);
      showToast(`已达 ${MAX_LENGTH} 字上限`, 'error');
    }
    setText(value);
  }

  // ===== Submit =====

  function isMeaningfulText(text: string): boolean {
    const cleaned = text.replace(/[\s\p{P}\p{S}]/gu, '');
    return cleaned.length > 0;
  }

  async function handleSubmit(content: string, fromVoice: boolean) {
    const trimmed = content.trim();
    if (!trimmed) {
      showToast('请输入内容', 'error');
      return;
    }
    if (!isMeaningfulText(trimmed)) {
      showToast('未检测到有效文字，请重新输入', 'error');
      return;
    }
    setPageState('processing');
    clearDraft();
    try {
      const result = await processPhaseA({ content: trimmed, fromVoice });
      if (!result.hasSubstance) {
        setPageState('split');
        setText('');
        showToast('暂未从中提炼出明确观点', 'error');
        return;
      }
      const note = await createNote({
        title: result.title,
        fromVoice,
        original: result.original,
        keyPoints: result.keyPoints,
        deepThinking: result.deepThinking,
      });
      upsertCachedNote(note);
      setText('');
      router.push(`/notes/${note.id}?from=capture`);
    } catch {
      setPageState('split');
      showToast('AI 整理失败，请稍后重试', 'error');
    }
  }

  // ===== Cleanup =====

  useEffect(() => {
    return () => {
      recorderRef.current?.stop();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // ===== Render =====

  if (pageState === 'processing') {
    return (
      <main className="capture-page min-h-[100dvh]">
        <LoadingView />
      </main>
    );
  }

  if (pageState === 'recording') {
    return (
      <main className="capture-page min-h-[100dvh] flex flex-col px-[24px]">
        <div className="pt-[var(--space-48)] pb-[var(--space-16)]">
          <BackButton onClick={() => {
            recorderRef.current?.stop();
            if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
            setIsRecording(false);
            setPageState('split');
          }} />
        </div>
        <div className="flex-1 flex flex-col items-center justify-center gap-[var(--space-48)]">
          <RecordingIndicator
            isRecording={isRecording}
            isPaused={isPaused}
            elapsed={formatTime(elapsed)}
            onClick={togglePause}
          />
        </div>
        <div className="pb-[var(--space-48)]">
          <Button
            disabled={!isRecording || elapsed === 0}
            onClick={stopRecording}
          >
            完成
          </Button>
        </div>
      </main>
    );
  }

  if (pageState === 'editing') {
    return (
      <main className="capture-page min-h-[100dvh] flex flex-col px-[24px]">
        <div className="pt-[var(--space-48)] pb-[var(--space-16)]">
          <BackButton onClick={() => {
            saveDraft(text);
            setText('');
            setPageState('split');
          }} />
        </div>
        <div className="flex-1 flex flex-col min-h-0">
          <TextInput
            value={text}
            onChange={handleTextChange}
            maxLength={MAX_LENGTH}
          />
        </div>
        <div className="pb-[var(--space-48)]">
          <Button
            disabled={!text.trim()}
            onClick={() => handleSubmit(text, false)}
          >
            完成
          </Button>
        </div>
      </main>
    );
  }

  if (pageState === 'transcriptReview') {
    return (
      <main className="capture-page min-h-[100dvh] flex flex-col px-[24px]">
        <p className="transcript-review-hint pt-[var(--space-48)] pb-[var(--space-24)]">
          请确认转写原文，提交后 AI 将据此原文进行提炼分析
        </p>
        <div className="flex-1 flex flex-col min-h-0">
          <TranscriptReviewInput
            value={text}
            onChange={handleTextChange}
            maxLength={MAX_LENGTH}
          />
        </div>
        <div className="pb-[var(--space-48)]">
          <Button
            disabled={!text.trim()}
            onClick={() => handleSubmit(text, true)}
          >
            开始整理吧
          </Button>
        </div>
      </main>
    );
  }

  // Split View (default)
  return (
    <main className="capture-page min-h-[100dvh] pb-[112px] flex flex-col">
      {/* ===== 顶部品牌区 ===== */}
      <div className="pt-[var(--space-48)] px-[24px]">
        <div className="capture-brand">
          <div className="capture-brand-logo">
            <svg xmlns="http://www.w3.org/2000/svg" width="52" height="52" viewBox="0 0 52 52" fill="none" aria-hidden="true">
              <path d="M25.5 5C19 5 14.6 8.7 13.4 13.4C8.5 14.2 5.2 18 5.2 22.8C5.2 27 7.5 30.1 11.1 31.5C9.8 36 13.1 40.3 17.5 40.3C20.2 40.3 22 38.6 22.8 36M26.5 5C33 5 37.4 8.7 38.6 13.4C43.5 14.2 46.8 18 46.8 22.8C46.8 27 44.5 30.1 40.9 31.5C42.2 36 38.9 40.3 34.5 40.3C31.8 40.3 30 38.6 29.2 36" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M26 5V47" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <path d="M23 11.2C20.6 9.3 16.7 10.6 16.7 14.2C13.5 14.4 11.5 17.1 12.7 20C15.4 18.5 18.8 19.5 19.7 22.5C17.6 24.7 18.4 28.6 21.5 29.6C19.9 32.2 20.4 35 22.8 36" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M12.5 26.4C15.2 24.7 18.2 25.2 20.1 27.1M11.1 31.5C14.5 30.5 16.7 32.4 16.8 35.7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M29 11.2C31.4 9.3 35.3 10.6 35.3 14.2C38.5 14.4 40.5 17.1 39.3 20C36.6 18.5 33.2 19.5 32.3 22.5C34.4 24.7 33.6 28.6 30.5 29.6C32.1 32.2 31.6 35 29.2 36" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M39.5 26.4C36.8 24.7 33.8 25.2 31.9 27.1M40.9 31.5C37.5 30.5 35.3 32.4 35.2 35.7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="16.7" cy="14.2" r="1.8" fill="currentColor" />
              <circle cx="12.7" cy="20" r="1.6" fill="currentColor" />
              <circle cx="20.1" cy="27.1" r="1.6" fill="currentColor" />
              <circle cx="16.8" cy="35.7" r="1.6" fill="currentColor" />
              <circle cx="35.3" cy="14.2" r="1.8" fill="currentColor" />
              <circle cx="39.3" cy="20" r="1.6" fill="currentColor" />
              <circle cx="31.9" cy="27.1" r="1.6" fill="currentColor" />
              <circle cx="35.2" cy="35.7" r="1.6" fill="currentColor" />
            </svg>
          </div>
          <h1 className="page-title">Aha Hunter</h1>
        </div>
        <p className="capture-subtitle">把一闪而过的想法留住</p>
      </div>

      {/* ===== 中部记录主舞台 ===== */}
      <div className="capture-stage mx-[24px]" style={{ marginTop: '64px' }}>
        <h2 className="capture-stage-title">选择一种方式开始</h2>
        <div className="capture-entries">
          {voiceSupported && (
            <button
              className="capture-entry capture-entry--voice"
              onClick={startRecording}
              type="button"
            >
              <div className="capture-entry-icon">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="7.5" y="1" width="9" height="13" rx="4.5" />
                  <path d="M3 11a9 9 0 0 0 18 0" />
                  <line x1="12" y1="17" x2="12" y2="23" />
                  <line x1="8" y1="23" x2="16" y2="23" />
                </svg>
              </div>
              <span className="capture-entry-label">说出来</span>
              <span className="capture-entry-hint">随口说，AI 帮你整理</span>
            </button>
          )}

          <button
            className="capture-entry capture-entry--text"
            onClick={() => setPageState('editing')}
            type="button"
          >
            <div className="capture-entry-icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
              </svg>
            </div>
            <span className="capture-entry-label">写下来</span>
            <span className="capture-entry-hint">安静写下，再慢慢展开</span>
          </button>
        </div>
      </div>

      <BottomNav />
    </main>
  );
}
