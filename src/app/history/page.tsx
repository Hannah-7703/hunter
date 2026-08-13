'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { deleteNoteById } from '@/lib/store';
import { ensureNotes, removeCachedNote, useClientDataCache } from '@/lib/clientDataCache';
import { formatRelativeTime } from '@/lib/utils';
import BottomNav from '@/components/ui/BottomNav';
import EmptyState from '@/components/ui/EmptyState';
import LoadingView from '@/components/ui/LoadingView';
import DeleteDialog from '@/components/ui/DeleteDialog';
import { showToast } from '@/components/ui/Toast';

export default function HistoryPage() {
  const router = useRouter();
  const { notes } = useClientDataCache();
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    ensureNotes().catch(() => setLoadError(true));
  }, []);

  function retryLoad() {
    setLoadError(false);
    ensureNotes().catch(() => setLoadError(true));
  }

  function handleDelete(id: string) {
    deleteNoteById(id).then(() => {
      removeCachedNote(id);
      setDeleteTarget(null);
      showToast('笔记已删除', 'success');
    });
  }

  return (
    <main className="app-page min-h-[100dvh] pb-[72px] px-[24px]">
      <h1 className="page-title pt-[var(--space-48)] pb-[var(--space-24)]">
        历史
      </h1>

      {notes === null && !loadError ? (
        <LoadingView />
      ) : notes === null && loadError ? (
        <div className="text-center py-[var(--space-48)]">
          <p className="text-[14px] text-[var(--text-hint)] mb-[var(--space-16)]">加载失败</p>
          <button
            className="text-[14px] text-[var(--brand)] underline cursor-pointer bg-transparent border-none"
            onClick={retryLoad}
          >
            点击重试
          </button>
        </div>
      ) : notes!.length === 0 ? (
        <EmptyState lines={['暂无历史记录', '记录你的第一条灵感吧。']} />
      ) : (
        <div className="flex flex-col gap-[var(--space-16)]">
          {notes!.map((note, index) => (
            <div
              key={note.id}
              className={`relative card history-note-card cursor-pointer ${index % 2 === 1 ? 'history-note-card--dark' : ''}`}
              onClick={() => router.push(`/notes/${note.id}?from=history`)}
            >
              <button
                className="history-note-delete absolute top-[14px] right-[14px] w-[28px] h-[28px] rounded-full flex items-center justify-center border-none cursor-pointer"
                onClick={e => {
                  e.stopPropagation();
                  setDeleteTarget(note.id);
                }}
                aria-label="删除"
              >
                {'✕'}
              </button>
              <h3 className="history-note-title mb-[var(--space-8)]">
                {note.title}
              </h3>
              <p className="history-note-preview text-[14px] text-[var(--text-secondary)] truncate">
                {note.original.slice(0, 50)}
              </p>
              <span className="history-note-meta text-[13px] text-[var(--text-hint)] mt-[var(--space-8)] inline-block">
                {formatRelativeTime(note.createdAt)} · {note.keyPoints.length} 个观点
              </span>
            </div>
          ))}
        </div>
      )}

      {deleteTarget && (
        <DeleteDialog
          title="是否删除该笔记？"
          description="删除后笔记无法找回"
          onConfirm={() => handleDelete(deleteTarget)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      <BottomNav />
    </main>
  );
}
