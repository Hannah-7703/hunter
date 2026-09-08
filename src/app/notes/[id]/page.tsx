'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import Image from 'next/image';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import type { Note } from '@/shared/types';
import { updateNote } from '@/lib/store';
import {
  ensureMindNodes,
  ensureMindmapPreferences,
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
import BottomNav from '@/components/ui/BottomNav';
import { showToast } from '@/components/ui/Toast';
import { downloadMarkdown } from '@/lib/export';

type FirstNodeGuideAnchor = {
  tooltipLeft: number;
  tooltipTop: number;
  fingerLeft: number;
  fingerTop: number;
};

type DeepThinkingTab = 'question' | 'breakdown' | 'expand';
const DEEP_THINKING_TABS: DeepThinkingTab[] = ['breakdown', 'expand', 'question'];
type WalnutMood = 'positive' | 'negative' | 'neutral';

function InsightWalnut({ mood, delayed }: { mood: WalnutMood; delayed: boolean }) {
  return (
    <span
      className={`ai-notes-walnut ai-notes-walnut--${mood} ${delayed ? 'ai-notes-walnut--delayed' : ''}`}
      aria-hidden="true"
    >
      <Image
        className="ai-notes-walnut-image ai-notes-walnut-image--neutral"
        src="/images/walnut/neutral-curious-peek-v1.png"
        alt=""
        fill
        sizes="36px"
      />
      {mood === 'positive' && (
        <Image
          className="ai-notes-walnut-image ai-notes-walnut-image--happy"
          src="/images/walnut/happy-peek-v1.png"
          alt=""
          fill
          sizes="36px"
        />
      )}
      {mood === 'negative' && (
        <Image
          className="ai-notes-walnut-image ai-notes-walnut-image--emo"
          src="/images/walnut/emo-peek-v1.png"
          alt=""
          fill
          sizes="36px"
        />
      )}
      {mood === 'neutral' && (
        <Image
          className="ai-notes-walnut-image ai-notes-walnut-image--blink"
          src="/images/walnut/neutral-blink-peek-v1.png"
          alt=""
          fill
          sizes="36px"
        />
      )}
    </span>
  );
}

function FirstNodeGuide({ anchor }: { anchor: FirstNodeGuideAnchor }) {
  return (
    <div className="first-node-guide-layer" aria-hidden="true">
      <span
        className="first-node-guide-tooltip"
        role="status"
        style={{ left: anchor.tooltipLeft, top: anchor.tooltipTop }}
      >
        选一条值得反复回顾的观点，沉淀到脑图
      </span>
      <svg
        className="first-node-guide-finger"
        viewBox="0 0 80 80"
        style={{ left: anchor.fingerLeft, top: anchor.fingerTop }}
      >
        <path d="M37 66 25 53c-4-4 2-10 6-6l5 5V26c0-7 10-7 10 0v17l3-4c4-5 11 0 7 5l-4 6 4-4c5-4 10 3 5 7l-5 5 3-1c6-3 9 5 4 8l-11 8c-7 4-16 2-21-4Z" />
        <path d="M44 18v-7" />
      </svg>
    </div>
  );
}

export default function NotesPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const id = params.id as string;
  const from = searchParams.get('from') || 'history';

  const [note, setNote] = useState<Note | null>(() => getCachedNote(id));
  const [mindNodeIds, setMindNodeIds] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<DeepThinkingTab>('breakdown');
  const [revealPhaseBItems, setRevealPhaseBItems] = useState(false);
  const [draftItemId, setDraftItemId] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const dtSaveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const phaseBAnimationTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const phaseBTriggered = useRef(false);
  const phaseBRequestRef = useRef<string | null>(null);
  const [phaseBFailed, setPhaseBFailed] = useState(false);
  const [pendingItemId, setPendingItemId] = useState<string | null>(null);
  const [hasEverAddedMindNode, setHasEverAddedMindNode] = useState(false);
  const [mindmapPreferencesReady, setMindmapPreferencesReady] = useState(false);
  const [guideTargetId, setGuideTargetId] = useState<string | null>(null);
  const [showFirstNodeGuide, setShowFirstNodeGuide] = useState(false);
  const [firstNodeGuideAnchor, setFirstNodeGuideAnchor] = useState<FirstNodeGuideAnchor | null>(null);
  const [mindmapNudgeCount, setMindmapNudgeCount] = useState<number | null>(null);

  const startPhaseBItemReveal = useCallback(() => {
    clearTimeout(phaseBAnimationTimer.current);
    setRevealPhaseBItems(true);
    phaseBAnimationTimer.current = setTimeout(() => setRevealPhaseBItems(false), 460);
  }, []);

  // Cleanup all save timers on unmount
  useEffect(() => {
    return () => {
      clearTimeout(saveTimer.current);
      clearTimeout(dtSaveTimer.current);
      clearTimeout(phaseBAnimationTimer.current);
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
    ensureMindmapPreferences().then(preferences => {
      if (!cancelled) {
        setHasEverAddedMindNode(preferences.hasEverAddedMindNode);
        setMindmapPreferencesReady(true);
      }
    }).catch(() => {});

    return () => { cancelled = true; };
  }, [id, router]);

  useEffect(() => {
    if (!note || !phaseBReady || !mindmapPreferencesReady || hasEverAddedMindNode) return;
    const candidate = note.keyPoints.find(item => item.summary.trim() && !mindNodeIds.has(item.id));
    if (!candidate) return;

    const timer = window.setTimeout(() => {
      setGuideTargetId(candidate.id);
      setShowFirstNodeGuide(true);
    }, 800);
    return () => window.clearTimeout(timer);
  }, [note, phaseBReady, mindmapPreferencesReady, hasEverAddedMindNode, mindNodeIds]);

  useEffect(() => {
    if (!showFirstNodeGuide) return;
    const timer = window.setTimeout(() => setShowFirstNodeGuide(false), 5000);
    return () => window.clearTimeout(timer);
  }, [showFirstNodeGuide]);

  useEffect(() => {
    if (!showFirstNodeGuide) {
      return;
    }

    const target = document.querySelector<HTMLElement>('[data-first-node-guide-target="true"]');
    if (!target) return;

    const updatePosition = () => {
      const rect = target.getBoundingClientRect();
      const tooltipWidth = 270;
      const viewportPadding = 16;
      const tooltipLeft = Math.max(
        viewportPadding,
        Math.min(rect.right - tooltipWidth, window.innerWidth - tooltipWidth - viewportPadding),
      );

      setFirstNodeGuideAnchor({
        tooltipLeft,
        tooltipTop: Math.max(20, rect.top - 10),
        // The SVG fingertip is x=44 in an 80px viewBox; anchor that point to the magnifier's centre line.
        fingerLeft: rect.left + rect.width / 2 - (44 / 80) * 45,
        fingerTop: rect.bottom + 8,
      });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    const resizeObserver = new ResizeObserver(updatePosition);
    resizeObserver.observe(target);

    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
      resizeObserver.disconnect();
    };
  }, [showFirstNodeGuide, guideTargetId]);

  useEffect(() => {
    if (mindmapNudgeCount === null) return;
    const timer = window.setTimeout(() => setMindmapNudgeCount(null), 5000);
    return () => window.clearTimeout(timer);
  }, [mindmapNudgeCount]);

  // Phase 3: Phase B auto-trigger (state derived during render, only API call in effect)
  useEffect(() => {
    if (!note || phaseBTriggered.current || phaseBReady) return;
    phaseBTriggered.current = true;
    const requestId = note.id;
    phaseBRequestRef.current = requestId;
    processPhaseB(
      note.original,
      note.keyPoints,
      note.deepThinking.emotionInsight,
    )
      .then(deepThinking => {
        if (phaseBRequestRef.current !== requestId) return;
        startPhaseBItemReveal();
        setNote(prev => {
          if (!prev) return prev;
          const updated = { ...prev, deepThinking: { ...prev.deepThinking, ...deepThinking } };
          upsertCachedNote(updated);
          return updated;
        });
        updateNote(id, { deepThinking: { ...note.deepThinking, ...deepThinking } }).catch(() => {
          showToast('继续想想保存失败，请刷新页面', 'error');
        });
      })
      .catch(() => {
        if (phaseBRequestRef.current !== requestId) return;
        setPhaseBFailed(true);
      });
  }, [note, id, phaseBReady, startPhaseBItemReveal]);

  function handleRetryPhaseB() {
    if (!note) return;
    setPhaseBFailed(false);
    const requestId = note.id;
    phaseBRequestRef.current = requestId;
    processPhaseB(
      note.original,
      note.keyPoints,
      note.deepThinking.emotionInsight,
    )
      .then(deepThinking => {
        if (phaseBRequestRef.current !== requestId) return;
        startPhaseBItemReveal();
        setNote(prev => {
          if (!prev) return prev;
          const updated = { ...prev, deepThinking: { ...prev.deepThinking, ...deepThinking } };
          upsertCachedNote(updated);
          return updated;
        });
        updateNote(id, { deepThinking: { ...note.deepThinking, ...deepThinking } }).catch(() => {
          showToast('继续想想保存失败，请刷新页面', 'error');
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
    if (draftItemId === kps[idx].id) {
      if (!kps[idx].summary.trim() && !kps[idx].detail.trim()) {
        setNote({ ...note, keyPoints: kps });
        return;
      }
      setDraftItemId(null);
    }
    updateField('keyPoints', kps);
  }

  function updateEmotionInsight(field: 'summary' | 'detail', value: string) {
    if (!note || !note.deepThinking.emotionInsight?.present) return;
    updateField('deepThinking', {
      ...note.deepThinking,
      emotionInsight: { ...note.deepThinking.emotionInsight, [field]: value },
    });
  }

  function updateDTItem(tab: DeepThinkingTab, idx: number, field: 'summary' | 'detail', value: string) {
    if (!note) return;
    const dt = { ...note.deepThinking };
    const items = [...dt[tab]];
    items[idx] = { ...items[idx], [field]: value };
    if (draftItemId === items[idx].id) {
      if (!items[idx].summary.trim() && !items[idx].detail.trim()) {
        setNote({ ...note, deepThinking: { ...dt, [tab]: items } });
        return;
      }
      setDraftItemId(null);
    }
    updateField('deepThinking', { ...dt, [tab]: items });
  }

  function addRow(section: 'keyPoints' | 'deepThinking', tab?: DeepThinkingTab) {
    if (!note) return;
    if (section === 'keyPoints') {
      const newKp = { id: `ukp_${Date.now()}`, summary: '', detail: '' };
      setNote({ ...note, keyPoints: [...note.keyPoints, newKp] });
      setDraftItemId(newKp.id);
    } else if (tab) {
      const dt = { ...note.deepThinking };
      const items = [...dt[tab]];
      const newItem = { id: `udt_${Date.now()}`, summary: '', detail: '' };
      items.push(newItem);
      setNote({ ...note, deepThinking: { ...dt, [tab]: items } });
      setDraftItemId(newItem.id);
    }
  }

  function discardKeyPointDraft(itemId: string) {
    if (!note || draftItemId !== itemId) return;
    const updated = { ...note, keyPoints: note.keyPoints.filter(item => item.id !== itemId) };
    setDraftItemId(null);
    setNote(updated);
    upsertCachedNote(updated);
  }

  function discardDeepThinkingDraft(tab: DeepThinkingTab, itemId: string) {
    if (!note || draftItemId !== itemId) return;
    const updated = {
      ...note,
      deepThinking: {
        ...note.deepThinking,
        [tab]: note.deepThinking[tab].filter(item => item.id !== itemId),
      },
    };
    setDraftItemId(null);
    setNote(updated);
    upsertCachedNote(updated);
  }

  async function handleToggleMindNode(itemId: string, summary: string, detail: string) {
    const isAdding = !mindNodeIds.has(itemId);
    const nextIds = await toggleMindNode(
      id, itemId, summary, detail, mindNodeIds,
      (pending) => setPendingItemId(pending ? itemId : null),
      () => ensureMindNodes().then(nodes => {
        const ids = new Set<string>();
        nodes.filter(nd => nd.noteId === id).forEach(nd => ids.add(nd.itemId));
        setMindNodeIds(ids);
        if (isAdding) {
          setHasEverAddedMindNode(true);
          setShowFirstNodeGuide(false);
          setGuideTargetId(null);
          if (nodes.length < 4) {
            setMindmapNudgeCount(nodes.length);
          } else {
            showToast('已加入脑图', 'success');
          }
        }
      }),
    );
    setMindNodeIds(nextIds);
  }

  if (!note) return null;

  const tabs = DEEP_THINKING_TABS;
  const emotionInsight = note.deepThinking.emotionInsight;
  const walnutMood: WalnutMood = emotionInsight?.present && emotionInsight.valence === 'positive'
    ? 'positive'
    : emotionInsight?.present && emotionInsight.valence === 'negative'
      ? 'negative'
      : 'neutral';
  const tabLabels: Record<DeepThinkingTab, string> = {
    breakdown: '理清脉络',
    expand: '打开可能',
    question: '换个角度',
  };
  const dtItems = note.deepThinking[activeTab];
  const phaseBLoading = !phaseBReady && !phaseBFailed;

  return (
    <main className="app-page min-h-[100dvh] pb-[72px] px-[24px]">
      <div className="pt-[var(--space-48)] pb-[var(--space-16)] flex items-center justify-between">
        <BackButton onClick={() => router.push('/history')} />
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
          <Card className={from === 'capture' ? 'ai-notes-reveal ai-notes-reveal--original' : ''}>
            <Accordion title="提炼原文">
            <p className="text-[15px] text-[var(--text-primary)] whitespace-pre-wrap">
              {note.original}
            </p>
          </Accordion>
        </Card>

        <Card className={from === 'capture' ? 'ai-notes-reveal ai-notes-reveal--insight' : ''}>
          <Accordion
            title="看见自己"
            headerAccessory={(
              <span className="ai-notes-walnut-clip">
                <InsightWalnut mood={walnutMood} delayed={from === 'capture'} />
              </span>
            )}
          >
            <div className="ai-notes-insight-list flex flex-col gap-[var(--space-16)]">
              {note.deepThinking.emotionInsight?.present && (
                <div className="ai-notes-insight-item">
                  <BulletCard
                    summary={note.deepThinking.emotionInsight.summary}
                    detail={note.deepThinking.emotionInsight.detail}
                    onSummaryChange={v => updateEmotionInsight('summary', v)}
                    onDetailChange={v => updateEmotionInsight('detail', v)}
                    plusSelected={mindNodeIds.has(note.deepThinking.emotionInsight.id)}
                    onPlusClick={() => handleToggleMindNode(
                      note.deepThinking.emotionInsight!.id,
                      note.deepThinking.emotionInsight!.summary,
                      note.deepThinking.emotionInsight!.detail,
                    )}
                    plusDisabled={!note.deepThinking.emotionInsight.summary.trim()}
                    plusPending={pendingItemId === note.deepThinking.emotionInsight.id}
                  />
                </div>
              )}
              {note.keyPoints.map((kp, i) => (
                <div className="ai-notes-insight-item" key={kp.id}>
                  <BulletCard
                    summary={kp.summary}
                    detail={kp.detail}
                    onSummaryChange={v => updateKeyPoint(i, 'summary', v)}
                    onDetailChange={v => updateKeyPoint(i, 'detail', v)}
                    plusSelected={mindNodeIds.has(kp.id)}
                    onPlusClick={() => handleToggleMindNode(kp.id, kp.summary, kp.detail)}
                    plusDisabled={!kp.summary.trim()}
                    plusPending={pendingItemId === kp.id}
                    guideTarget={showFirstNodeGuide && guideTargetId === kp.id}
                    autoFocusSummary={draftItemId === kp.id}
                    onEmptyBlur={draftItemId === kp.id ? () => discardKeyPointDraft(kp.id) : undefined}
                  />
                </div>
              ))}
              <AddRowButton label="+ 添加观点" onClick={() => addRow('keyPoints')} />
            </div>
          </Accordion>
        </Card>

        <Card className={from === 'capture' ? 'ai-notes-reveal ai-notes-reveal--deep-thinking' : ''}>
          <Accordion title="继续想想">
            <Tabs
              tabs={tabs.map(t => tabLabels[t])}
              activeTab={tabLabels[activeTab]}
              onTabChange={label => {
                const entry = Object.entries(tabLabels).find(([, v]) => v === label);
                if (entry) setActiveTab(entry[0] as DeepThinkingTab);
              }}
            />
            <div className="flex flex-col gap-[var(--space-16)] mt-[var(--space-16)]">
              {phaseBFailed ? (
                <div className="text-center py-[var(--space-16)]">
                  <p className="text-[13px] text-[var(--text-hint)] mb-[var(--space-8)]">继续想想生成失败</p>
                  <button
                    className="text-[14px] text-[var(--brand)] underline cursor-pointer bg-transparent border-none"
                    onClick={handleRetryPhaseB}
                  >
                    点击重试
                  </button>
                </div>
              ) : phaseBLoading ? (
                <div className="phase-b-loading" role="status" aria-label="正在继续想想">
                  {[0, 1, 2].map(index => (
                    <div className="phase-b-skeleton" aria-hidden="true" key={index}>
                      <span className="phase-b-skeleton-summary" />
                      <span className="phase-b-skeleton-line" />
                      <span className="phase-b-skeleton-line phase-b-skeleton-line--short" />
                    </div>
                  ))}
                </div>
              ) : dtItems.length === 0 ? (
                <p className="text-[13px] text-[var(--text-hint)]">继续想想暂时不可用</p>
              ) : (
                <>
                  {dtItems.map((item, i) => (
                    <div className={revealPhaseBItems ? 'phase-b-item-reveal' : ''} key={item.id}>
                      <BulletCard
                        summary={item.summary}
                        detail={item.detail}
                        onSummaryChange={v => updateDTItem(activeTab, i, 'summary', v)}
                        onDetailChange={v => updateDTItem(activeTab, i, 'detail', v)}
                        plusSelected={mindNodeIds.has(item.id)}
                        onPlusClick={() => handleToggleMindNode(item.id, item.summary, item.detail)}
                        plusDisabled={!item.summary.trim()}
                        plusPending={pendingItemId === item.id}
                        autoFocusSummary={draftItemId === item.id}
                        onEmptyBlur={draftItemId === item.id
                          ? () => discardDeepThinkingDraft(activeTab, item.id)
                          : undefined}
                      />
                    </div>
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

      {mindmapNudgeCount !== null && (
        <div className="mindmap-first-nudge" role="status">
          <strong>✦ 已沉淀 {mindmapNudgeCount} 条观点</strong>
          <span>再留下 {4 - mindmapNudgeCount} 条，<span className="mindmap-first-nudge-relation">Hunter 会帮你发现跨记录之间的关联</span></span>
        </div>
      )}

      {showFirstNodeGuide && firstNodeGuideAnchor && (
        <FirstNodeGuide anchor={firstNodeGuideAnchor} />
      )}

      <BottomNav />
    </main>
  );
}
