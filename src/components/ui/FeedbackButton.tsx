'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { showToast } from '@/components/ui/Toast';

const categories = ['功能异常', '体验建议', '想要的功能', '其他'] as const;
type Category = (typeof categories)[number] | null;

function pageFromPathname(pathname: string): 'capture' | 'history' | 'mindmap' | 'note' {
  if (pathname === '/history') return 'history';
  if (pathname === '/mindmap') return 'mindmap';
  if (pathname.startsWith('/notes/')) return 'note';
  return 'capture';
}

function pageLabel(page: ReturnType<typeof pageFromPathname>): string {
  return { capture: '记录', history: '历史', mindmap: '脑图', note: '笔记详情' }[page];
}

export default function FeedbackButton() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<Category>(null);
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const page = pageFromPathname(pathname);

  function close() {
    if (submitting) return;
    setOpen(false);
  }

  async function submit() {
    const trimmed = content.trim();
    if (!trimmed || submitting) return;

    setSubmitting(true);
    try {
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, content: trimmed, page }),
      });
      const data = await response.json().catch(() => null) as { error?: string; success?: boolean } | null;
      if (!response.ok || !data?.success) {
        throw new Error(data?.error ?? '提交失败，请稍后重试');
      }

      setCategory(null);
      setContent('');
      setOpen(false);
      showToast('收到，感谢你帮 Aha Hunter 变得更好。', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '提交失败，请稍后重试', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <button
        className="feedback-fab"
        type="button"
        aria-label="问题与反馈"
        title="问题与反馈"
        onClick={() => setOpen(true)}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M20 11.5a4.5 4.5 0 0 1-4.5 4.5H9l-4 3v-7.5A4.5 4.5 0 0 1 9.5 7h6A4.5 4.5 0 0 1 20 11.5Z" />
          <path d="M12.5 10v4M10.5 12h4" />
        </svg>
      </button>

      {open && (
        <div className="feedback-overlay" role="presentation" onMouseDown={close}>
          <section
            className="feedback-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="feedback-title"
            onMouseDown={event => event.stopPropagation()}
          >
            <div className="feedback-sheet-header">
              <h2 id="feedback-title">问题与反馈</h2>
              <button className="feedback-close" type="button" aria-label="关闭反馈" onClick={close}>×</button>
            </div>

            <p className="feedback-prompt">这次使用感觉怎么样？</p>
            <div className="feedback-categories" aria-label="反馈分类">
              {categories.map(item => (
                <button
                  key={item}
                  type="button"
                  className={`feedback-category ${category === item ? 'selected' : ''}`}
                  aria-pressed={category === item}
                  onClick={() => setCategory(category === item ? null : item)}
                >
                  {item}
                </button>
              ))}
            </div>

            <label className="feedback-label" htmlFor="feedback-content">请告诉我您的宝贵意见 ~</label>
            <textarea
              id="feedback-content"
              className="feedback-content"
              value={content}
              onChange={event => setContent(event.target.value.slice(0, 500))}
              maxLength={500}
              placeholder=""
              disabled={submitting}
            />
            <p className="feedback-count">{content.length} / 500</p>

            <p className="feedback-anonymous">
              此反馈为匿名反馈，不会附带你的笔记、录音内容和邀请码。
              <span>当前页面：{pageLabel(page)}</span>
            </p>

            <button
              className="feedback-submit"
              type="button"
              disabled={!content.trim() || submitting}
              onClick={submit}
            >
              {submitting ? '提交中…' : '提交反馈'}
            </button>
          </section>
        </div>
      )}
    </>
  );
}
