'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import type { Note } from '@/shared/types';
import { updateNote } from '@/lib/store';
import {
  ensureMindNodes,
  ensureNote,
  getCachedNote,
  upsertCachedNote,
} from '@/lib/clientDataCache';
import { toggleMindNode } from '@/lib/mindNodeActions';
import { processPhaseB } from '@/lib/deepseek';
import BackButton from '@/components/ui/BackButton';
import Title from '@/components/ui/Title';
import AudioBar from '@/components/ui/AudioBar';
import Accordion from '@/components/ui/Accordion';
import Tabs from '@/components/ui/Tabs';
import Card from '@/components/ui/Card';
import BulletCard from '@/components/ui/BulletCard';
import AddRowButton from '@/components/ui/AddRowButton';
import LoadingView from '@/components/ui/LoadingView';
import BottomNav from '@/components/ui/BottomNav';
import { showToast } from '@/components/ui/Toast';
import { downloadMarkdown } from '@/lib/export';

export default function NotesPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const id = params.id as string;
  const from = searchParams.get('from') || 'history';

  const [note, setNote] = useState<Note | null>(() => getCachedNote(id));
  const [mindNodeIds, setMindNodeIds] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState('breakdown');
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const dtSaveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const phaseBTriggered = useRef(false);
  const phaseBRequestRef = useRef<string | null>(null);
  const [phaseBFailed, setPhaseBFailed] = useState(false);
  const [pendingItemId, setPendingItemId] = useState<string | null>(null);

  // Cleanup all save timers on unmount
  useEffect(() => {
    return () => {
      clearTimeout(saveTimer.current);
      clearTimeout(dtSaveTimer.current);
    };
  }, []);

  const phaseBReady = note && (
    (note.deepThinking.question?.length ?? 0) > 0 ||
    (note.deepThinking.breakdown?.length ?? 0) > 0 ||
    (note.deepThinking.expand?.length ?? 0) > 0
  );

  useEffect(() => {
    let cancelled = false;

    ensureNote(id).then(n => {
      if (cancelled) return;
      if (!n) { router.push('/'); return; }
      setNote(n);
    });
    ensureMindNodes().then(nodes => {
      if (cancelled) return;
      const ids = new Set<string>();
      nodes.filter(nd => nd.noteId === id).forEach(nd => ids.add(nd.itemId));
      setMindNodeIds(ids);
    });

    return () => { cancelled = true; };
  }, [id, router]);

  // Phase 3: Phase B auto-trigger (state derived during render, only API call in effect)
  useEffect(() => {
    if (!note || phaseBTriggered.current || phaseBReady) return;
    phaseBTriggered.current = true;
    const requestId = note.id;
    phaseBRequestRef.current = requestId;
    processPhaseB(note.original, note.keyPoints)
      .then(deepThinking => {
        if (phaseBRequestRef.current !== requestId) return;
        setNote(prev => {
          if (!prev) return prev;
          const updated = { ...prev, deepThinking };
          upsertCachedNote(updated);
          return updated;
        });
        updateNote(id, { deepThinking }).catch(() => {
          showToast('深度分析保存失败，请刷新页面', 'error');
        });
      })
      .catch(() => {
        if (phaseBRequestRef.current !== requestId) return;
        setPhaseBFailed(true);
      });
  }, [note, id, phaseBReady]);

  function handleRetryPhaseB() {
    if (!note) return;
    setPhaseBFailed(false);
    const requestId = note.id;
    phaseBRequestRef.current = requestId;
    processPhaseB(note.original, note.keyPoints)
      .then(deepThinking => {
        if (phaseBRequestRef.current !== requestId) return;
        setNote(prev => {
          if (!prev) return prev;
          const updated = { ...prev, deepThinking };
          upsertCachedNote(updated);
          return updated;
        });
        updateNote(id, { deepThinking }).catch(() => {
          showToast('深度分析保存失败，请刷新页面', 'error');
        });
      })
      .catch(() => {
        if (phaseBRequestRef.current !== requestId) return;
        setPhaseBFailed(true);
      });
  }

  // 保存用户可编辑的元数据字段（不包含 deepThinking，避免覆盖 AI 结果）
  const debounceSaveMeta = useCallback((updated: Note) => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      updateNote(id, {
        title: updated.title,
        original: updated.original,
        keyPoints: updated.keyPoints,
      }).catch(() => {
        showToast('保存失败，稍后重试', 'error');
      });
    }, 500);
  }, [id]);

  // 独立保存 deepThinking（用户手动编辑时）
  const debounceSaveDT = useCallback((dt: Note['deepThinking']) => {
    clearTimeout(dtSaveTimer.current);
    dtSaveTimer.current = setTimeout(() => {
      updateNote(id, { deepThinking: dt }).catch(() => {
        showToast('保存失败，稍后重试', 'error');
      });
    }, 500);
  }, [id]);

  function updateField<K extends keyof Note>(field: K, value: Note[K]) {
    if (!note) return;
    const updated = { ...note, [field]: value };
    setNote(updated);
    upsertCachedNote(updated);
    if (field === 'deepThinking') {
      debounceSaveDT(value as Note['deepThinking']);
    } else {
      debounceSaveMeta(updated);
    }
  }

  function updateKeyPoint(idx: number, field: 'summary' | 'detail', value: string) {
    if (!note) return;
    const kps = [...note.keyPoints];
    kps[idx] = { ...kps[idx], [field]: value };
    updateField('keyPoints', kps);
  }

  function updateDTItem(tab: string, idx: number, field: 'summary' | 'detail', value: string) {
    if (!note) return;
    const dt = { ...note.deepThinking };
    const items = [...(dt[tab as keyof typeof dt] || [])];
    items[idx] = { ...items[idx], [field]: value };
    updateField('deepThinking', { ...dt, [tab]: items });
  }

  function addRow(section: 'keyPoints' | 'deepThinking', tab?: string) {
    if (!note) return;
    if (section === 'keyPoints') {
      const newKp = { id: `ukp_${Date.now()}`, summary: '', detail: '' };
      updateField('keyPoints', [...note.keyPoints, newKp]);
    } else if (tab) {
      const dt = { ...note.deepThinking };
      const items = [...(dt[tab as keyof typeof dt] || [])];
      items.push({ id: `udt_${Date.now()}`, summary: '', detail: '' });
      updateField('deepThinking', { ...dt, [tab]: items });
    }
  }

  async function handleToggleMindNode(itemId: string, summary: string, detail: string) {
    const nextIds = await toggleMindNode(
      id, itemId, summary, detail, mindNodeIds,
      (pending) => setPendingItemId(pending ? itemId : null),
      () => ensureMindNodes().then(nodes => {
        const ids = new Set<string>();
        nodes.filter(nd => nd.noteId === id).forEach(nd => ids.add(nd.itemId));
        setMindNodeIds(ids);
      }),
    );
    setMindNodeIds(nextIds);
  }

  if (!note) return null;

  const tabs = ['breakdown', 'expand', 'question'] as const;
  const tabLabels: Record<string, string> = { question: '拷问', breakdown: '拆解', expand: '拓展' };
  const dtItems = note.deepThinking[activeTab as keyof typeof note.deepThinking] || [];

  return (
    <main className="app-page min-h-[100dvh] pb-[72px] px-[24px]">
      <div className="pt-[var(--space-48)] pb-[var(--space-16)] flex items-center justify-between">
        <BackButton onClick={() => router.push(from === 'capture' ? '/' : '/history')} />
        <button
          className="export-btn"
          data-tour="export"
          onClick={() => {
            downloadMarkdown(note);
            showToast('已导出', 'success');
          }}
          aria-label="导出 Markdown"
          type="button"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" fill="none" stroke="white" strokeWidth="1.7" />
            <polyline points="7 10 12 15 17 10" fill="none" stroke="white" strokeWidth="1.7" />
            <line x1="12" y1="15" x2="12" y2="3" fill="none" stroke="white" strokeWidth="1.7" />
          </svg>
        </button>
      </div>

      <div className="notes-content">
        <div className="mb-[var(--space-24)]">
          <Title
            value={note.title}
            onChange={v => updateField('title', v)}
          />
        </div>

        {note.fromVoice && note.audioDuration && (
          <AudioBar duration={note.audioDuration} />
        )}

        <div className="flex flex-col gap-[var(--space-24)]">
          <Card>
            <Accordion title="提炼原文">
            <p className="text-[15px] text-[var(--text-primary)] whitespace-pre-wrap">
              {note.original}
            </p>
          </Accordion>
        </Card>

        <Card>
          <Accordion title="提炼观点">
            <div className="flex flex-col gap-[var(--space-16)]">
              {note.keyPoints.map((kp, i) => (
                <BulletCard
                  key={kp.id}
                  summary={kp.summary}
                  detail={kp.detail}
                  onSummaryChange={v => updateKeyPoint(i, 'summary', v)}
                  onDetailChange={v => updateKeyPoint(i, 'detail', v)}
                  plusSelected={mindNodeIds.has(kp.id)}
                  onPlusClick={() => handleToggleMindNode(kp.id, kp.summary, kp.detail)}
                  plusDisabled={!kp.summary.trim()}
                  plusPending={pendingItemId === kp.id}
                />
              ))}
              <AddRowButton label="+ 添加观点" onClick={() => addRow('keyPoints')} />
            </div>
          </Accordion>
        </Card>

        <Card>
          <Accordion title="深度分析">
            <Tabs
              tabs={tabs.map(t => tabLabels[t])}
              activeTab={tabLabels[activeTab]}
              onTabChange={label => {
                const entry = Object.entries(tabLabels).find(([, v]) => v === label);
                if (entry) setActiveTab(entry[0]);
              }}
            />
            <div className="flex flex-col gap-[var(--space-16)] mt-[var(--space-16)]">
              {(!phaseBReady && !phaseBFailed) ? (
                <LoadingView text="正在生成深度分析…" />
              ) : phaseBFailed ? (
                <div className="text-center py-[var(--space-16)]">
                  <p className="text-[13px] text-[var(--text-hint)] mb-[var(--space-8)]">深度分析生成失败</p>
                  <button
                    className="text-[14px] text-[var(--brand)] underline cursor-pointer bg-transparent border-none"
                    onClick={handleRetryPhaseB}
                  >
                    点击重试
                  </button>
                </div>
              ) : dtItems.length === 0 ? (
                <p className="text-[13px] text-[var(--text-hint)]">深度分析暂时不可用</p>
              ) : (
                <>
                  {dtItems.map((item, i) => (
                    <BulletCard
                      key={item.id}
                      summary={item.summary}
                      detail={item.detail}
                      onSummaryChange={v => updateDTItem(activeTab, i, 'summary', v)}
                      onDetailChange={v => updateDTItem(activeTab, i, 'detail', v)}
                      plusSelected={mindNodeIds.has(item.id)}
                      onPlusClick={() => handleToggleMindNode(item.id, item.summary, item.detail)}
                      plusDisabled={!item.summary.trim()}
                      plusPending={pendingItemId === item.id}
                    />
                  ))}
                  <AddRowButton
                    label="+ 添加条目"
                    onClick={() => addRow('deepThinking', activeTab)}
                  />
                </>
              )}
            </div>
          </Accordion>
        </Card>
        </div>
      </div>

      <p className="notes-disclaimer">
        以上内容由 AI 基于你的原始记录整理生成，仅供启发与参考，不构成专业建议。请结合实际情况自行判断与核实。
      </p>

      <BottomNav />
    </main>
  );
}
