'use client';

import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { MindNode as MindNodeType, Note } from '@/shared/types';
import {
  ensureMindNodes,
  ensureNotes,
  ensureMindmapPreferences,
  getCachedMindmapPreferences,
  hydrateMindmapFocus,
  markMindmapReadError,
  prepareMindmapFocus,
  completeMindmapMotion,
  refreshMindNodes,
  moveNodeToBackground,
  setManualRootAndRecluster,
  useClientDataCache,
  deleteNodeFromCache,
  dismissMindmapError,
} from '@/lib/clientDataCache';
import {
  buildVisibleEdges,
  computeFocusLayout,
  fitLayoutToCanvas,
  nodesHash,
  type FocusResult,
} from '@/lib/mindmapLayout';
import MindNode from '@/components/ui/MindNode';
import { ClusterOverlay, ScatterOverlay } from '@/components/ui/MindMapOverlay';
import type { RelatedNodeItem } from '@/components/ui/MindMapOverlay';
import BottomNav from '@/components/ui/BottomNav';
import EmptyState from '@/components/ui/EmptyState';
import LoadingView from '@/components/ui/LoadingView';
import NodeActionDialog from '@/components/ui/NodeActionDialog';
import MindmapDemo from '@/components/mindmap/MindmapDemo';
import { showToast } from '@/components/ui/Toast';
import { reportProductEvent } from '@/lib/clientDiagnostics';

const SVG_WIDTH = 720;
const SVG_HEIGHT = 900;
const PAD = 80;
const MINDMAP_DEMO_CLOSED_KEY = 'aha-hunter-mindmap-demo-closed';

type MindmapAnimationPhase = 'idle' | 'moving' | 'lines-revealed' | 'notice' | 'notice-leaving';

interface MindmapAnimationState {
  motionId: number | null;
  mode: 'full' | 'light' | null;
  phase: MindmapAnimationPhase;
}

type MindmapAnimationAction =
  | { type: 'START'; id: number; mode: 'full' | 'light' }
  | { type: 'REVEAL_LINES'; id: number }
  | { type: 'SHOW_NOTICE'; id: number }
  | { type: 'LEAVE_NOTICE'; id: number }
  | { type: 'FINISH'; id: number };

const initialMindmapAnimationState: MindmapAnimationState = {
  motionId: null,
  mode: null,
  phase: 'idle',
};

function mindmapAnimationReducer(
  state: MindmapAnimationState,
  action: MindmapAnimationAction,
): MindmapAnimationState {
  if (action.type === 'START') {
    return { motionId: action.id, mode: action.mode, phase: 'moving' };
  }
  if (state.motionId !== action.id) return state;

  switch (action.type) {
    case 'REVEAL_LINES':
      return { ...state, phase: 'lines-revealed' };
    case 'SHOW_NOTICE':
      return { ...state, phase: 'notice' };
    case 'LEAVE_NOTICE':
      return { ...state, phase: 'notice-leaving' };
    case 'FINISH':
      return initialMindmapAnimationState;
    default:
      return state;
  }
}

function computeScatterLayout(nodes: MindNodeType[]): Map<string, { x: number; y: number }> {
  const layout = new Map<string, { x: number; y: number }>();
  const cols = Math.ceil(Math.sqrt(Math.max(nodes.length, 1)));
  const spacing = Math.min(100, Math.max(60, (SVG_WIDTH - PAD * 2) / cols));

  nodes.forEach((node, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    layout.set(node.id, {
      x: PAD + spacing / 2 + col * spacing,
      y: PAD + spacing / 2 + row * spacing,
    });
  });

  return layout;
}

function buildItemMap(notes: Note[] | null): Map<string, { summary: string; detail: string }> {
  const map = new Map<string, { summary: string; detail: string }>();
  for (const note of notes ?? []) {
    for (const keyPoint of note.keyPoints) {
      map.set(keyPoint.id, { summary: keyPoint.summary, detail: keyPoint.detail });
    }
    const emotionInsight = note.deepThinking.emotionInsight;
    if (emotionInsight?.present) {
      map.set(emotionInsight.id, { summary: emotionInsight.summary, detail: emotionInsight.detail });
    }
    for (const tab of ['question', 'breakdown', 'expand'] as const) {
      for (const item of note.deepThinking[tab]) {
        map.set(item.id, { summary: item.summary, detail: item.detail });
      }
    }
  }
  return map;
}

export default function MindMapPage() {
  const { notes, mindNodes, focus, mindmapMotion } = useClientDataCache();
  const nodes = useMemo(() => mindNodes ?? [], [mindNodes]);
  const [selectedFocusResult, setSelectedFocusResult] = useState<FocusResult | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [animation, dispatchAnimation] = useReducer(mindmapAnimationReducer, initialMindmapAnimationState);
  const [loadError, setLoadError] = useState(false);
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [needsManualReanalysis, setNeedsManualReanalysis] = useState(false);
  const [hasEverAddedMindNode, setHasEverAddedMindNode] = useState(false);
  const [isDemoOpen, setIsDemoOpen] = useState(false);
  const [clusterActionTarget, setClusterActionTarget] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [rootDeleteTarget, setRootDeleteTarget] = useState<string | null>(null);
  const [isSavingRoot, setIsSavingRoot] = useState(false);
  const [isDeletingRoot, setIsDeletingRoot] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const reclusterToastKeyRef = useRef<string | null>(null);
  const hasReportedMindmapViewRef = useRef(false);
  const hasReportedMindmapNodeOpenRef = useRef(false);
  const panRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    scrollLeft: number;
    scrollTop: number;
    moved: boolean;
  } | null>(null);

  const hash = useMemo(() => nodesHash(nodes), [nodes]);
  // 增量分析、重组或失败时都继续使用上一版图，避免整张脑图退回散点。
  const readyFocus = focus?.hash === hash && focus.result ? focus.result : null;
  // 只有真正发起 AI 请求时才显示“生成关联关系”；
  // 刷新后恢复已保存结果的短暂阶段不应被误认为正在重新分析。
  const isFocusLoading = focus?.hash === hash && focus.status === 'loading';
  const itemMap = useMemo(() => buildItemMap(notes), [notes]);

  // 根节点变更时沿用“已加入脑图”的全局 Toast 视觉，避免脑图页出现另一套提示样式。
  useEffect(() => {
    if (!isFocusLoading || focus?.operation !== 'recluster') return;
    const key = `${focus.hash}:${focus.operation}`;
    if (reclusterToastKeyRef.current === key) return;
    reclusterToastKeyRef.current = key;
    showToast('正在重组关联', 'success');
  }, [focus?.hash, focus?.operation, isFocusLoading]);

  useEffect(() => {
    if (!hasReportedMindmapViewRef.current) {
      hasReportedMindmapViewRef.current = true;
      reportProductEvent('mindmap_viewed');
    }
    void ensureNotes();
    ensureMindNodes().then(async loadedNodes => {
      const cachedPreferences = getCachedMindmapPreferences();

      // 从其他页面回到脑图时，先使用当前登录会话内已经验证过的节点与聚合结果。
      // 这一步不请求 AI；后台请求仅负责校验是否有其他页面或设备带来的结构变动。
      if (cachedPreferences) {
        setHasEverAddedMindNode(cachedPreferences.hasEverAddedMindNode);
        await hydrateMindmapFocus(loadedNodes, false);
        setPreferencesReady(true);

        void Promise.all([refreshMindNodes(), ensureMindmapPreferences(true)])
          .then(async ([latestNodes, preferences]) => {
            setHasEverAddedMindNode(preferences.hasEverAddedMindNode);
            await hydrateMindmapFocus(latestNodes);
          })
          .catch(() => {
            // 已有一份可展示的会话内旧图时保留它，并交给现有读取失败弹窗处理。
            markMindmapReadError(loadedNodes);
          });
        return;
      }

      try {
        const preferences = await ensureMindmapPreferences();
        setHasEverAddedMindNode(preferences.hasEverAddedMindNode);
        await hydrateMindmapFocus(loadedNodes);
      } catch {
        // 读取失败时只展示散点，必须由用户决定是否重试读取。
        markMindmapReadError(loadedNodes);
        setNeedsManualReanalysis(true);
      } finally {
        setPreferencesReady(true);
      }
    }).catch(() => setLoadError(true));
  }, []);

  useEffect(() => {
    if (!preferencesReady || mindNodes === null) return;
    const demoClosed = window.localStorage.getItem(MINDMAP_DEMO_CLOSED_KEY) === 'true';
    const frame = requestAnimationFrame(() => {
      if (nodes.length === 0 && !hasEverAddedMindNode && !demoClosed) {
        setIsDemoOpen(true);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [preferencesReady, mindNodes, nodes.length, hasEverAddedMindNode]);

  function handleCloseDemo() {
    window.localStorage.setItem(MINDMAP_DEMO_CLOSED_KEY, 'true');
    setIsDemoOpen(false);
  }

  function retryLoad() {
    setLoadError(false);
    ensureMindNodes()
      .then(async loadedNodes => {
        const preferences = await ensureMindmapPreferences(true);
        setHasEverAddedMindNode(preferences.hasEverAddedMindNode);
        await hydrateMindmapFocus(loadedNodes);
        setPreferencesReady(true);
      })
      .catch(() => setLoadError(true));
  }

  useEffect(() => {
    if (!readyFocus || mindmapMotion?.status !== 'ready') return;

    const motion = mindmapMotion;
    const startTimer = window.setTimeout(() => {
      dispatchAnimation({ type: 'START', id: motion.id, mode: motion.mode });
    }, 0);
    return () => window.clearTimeout(startTimer);
  }, [mindmapMotion, readyFocus]);

  useEffect(() => {
    if (animation.phase !== 'moving' || animation.motionId === null || animation.mode === null) return;

    const timer = window.setTimeout(() => {
      dispatchAnimation({ type: 'REVEAL_LINES', id: animation.motionId! });
    }, animation.mode === 'full' ? 1050 : 280);
    return () => window.clearTimeout(timer);
  }, [animation]);

  useEffect(() => {
    if (animation.phase !== 'lines-revealed' || animation.motionId === null || animation.mode === null) return;

    const timer = window.setTimeout(() => {
      const motionId = animation.motionId!;
      completeMindmapMotion(motionId);
      dispatchAnimation({ type: animation.mode === 'full' ? 'SHOW_NOTICE' : 'FINISH', id: motionId });
    }, animation.mode === 'full' ? 200 : 180);
    return () => window.clearTimeout(timer);
  }, [animation]);

  useEffect(() => {
    if (animation.phase !== 'notice' || animation.motionId === null) return;

    const timer = window.setTimeout(() => {
      dispatchAnimation({ type: 'LEAVE_NOTICE', id: animation.motionId! });
    }, 2000);
    return () => window.clearTimeout(timer);
  }, [animation]);

  useEffect(() => {
    if (animation.phase !== 'notice-leaving' || animation.motionId === null) return;

    const timer = window.setTimeout(() => {
      dispatchAnimation({ type: 'FINISH', id: animation.motionId! });
    }, 180);
    return () => window.clearTimeout(timer);
  }, [animation]);

  function handleCloseOverlay() {
    setSelectedNodeId(null);
    setSelectedFocusResult(null);
  }

  function handleNodeClick(nodeId: string) {
    if (!hasReportedMindmapNodeOpenRef.current) {
      hasReportedMindmapNodeOpenRef.current = true;
      reportProductEvent('mindmap_node_opened');
    }
    setSelectedFocusResult(readyFocus);
    setSelectedNodeId(nodeId);
  }

  function handleCanvasPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if ((event.target as Element).closest('button')) return;

    const container = event.currentTarget;
    panRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      scrollLeft: container.scrollLeft,
      scrollTop: container.scrollTop,
      moved: false,
    };
    container.setPointerCapture(event.pointerId);
  }

  function handleCanvasPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const pan = panRef.current;
    if (!pan || pan.pointerId !== event.pointerId) return;

    const offsetX = event.clientX - pan.startX;
    const offsetY = event.clientY - pan.startY;
    if (!pan.moved && Math.hypot(offsetX, offsetY) < 5) return;

    pan.moved = true;
    event.currentTarget.scrollLeft = pan.scrollLeft - offsetX;
    event.currentTarget.scrollTop = pan.scrollTop - offsetY;
    setIsPanning(true);
  }

  function handleCanvasPointerEnd(event: React.PointerEvent<HTMLDivElement>) {
    const pan = panRef.current;
    if (!pan || pan.pointerId !== event.pointerId) return;
    panRef.current = null;
    setIsPanning(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  async function handleSetRoot(nodeId: string) {
    if (isSavingRoot) return;
    setIsSavingRoot(true);

    try {
      setSelectedNodeId(null);
      setSelectedFocusResult(null);
      await setManualRootAndRecluster(nodes, nodeId);
    } catch {
      showToast('根节点保存失败，请重试', 'error');
    } finally {
      setIsSavingRoot(false);
    }
  }

  function handleRemoveFromClusterClick(nodeId: string) {
    setClusterActionTarget(nodeId);
  }

  async function handleConfirmRemoveFromCluster(nodeId: string) {
    await moveNodeToBackground(nodeId);
    if (selectedFocusResult) {
      setSelectedFocusResult({
        ...selectedFocusResult,
        primaryRelated: selectedFocusResult.primaryRelated.filter(id => id !== nodeId),
        secondaryRelated: selectedFocusResult.secondaryRelated.filter(id => id !== nodeId),
        backgroundNodes: selectedFocusResult.backgroundNodes.includes(nodeId)
          ? selectedFocusResult.backgroundNodes
          : [...selectedFocusResult.backgroundNodes, nodeId],
      });
    }
    setClusterActionTarget(null);
  }

  async function handleDeleteNode(nodeId: string) {
    await deleteNodeFromCache(nodeId);
    setClusterActionTarget(null);
    setDeleteTarget(null);
    setSelectedNodeId(null);
    setSelectedFocusResult(null);
  }

  function handleScatterDeleteClick(nodeId: string) {
    setDeleteTarget(nodeId);
  }

  async function handleConfirmRootDelete(nodeId: string) {
    if (isDeletingRoot) return;
    setIsDeletingRoot(true);

    try {
      await deleteNodeFromCache(nodeId);
      setRootDeleteTarget(null);
      setSelectedNodeId(null);
      setSelectedFocusResult(null);
    } catch {
      showToast('删除根节点失败，请重试', 'error');
    } finally {
      setIsDeletingRoot(false);
    }
  }

  const focusResult = selectedNodeId ? selectedFocusResult : readyFocus;
  const rawLayout = focusResult
    ? computeFocusLayout(nodes, focusResult, SVG_WIDTH, SVG_HEIGHT)
    : computeScatterLayout(nodes);
  const fittedLayout = fitLayoutToCanvas(rawLayout, SVG_WIDTH + PAD * 2, SVG_HEIGHT + PAD * 2, PAD);
  const layout = fittedLayout.layout;
  const visibleEdges = focusResult ? buildVisibleEdges(focusResult) : [];
  const isWaitingToRevealLines = mindmapMotion?.status === 'ready'
    && (animation.motionId !== mindmapMotion.id || animation.phase === 'moving');
  const showLines = Boolean(focusResult && !isWaitingToRevealLines);
  const activeMotionMode = mindmapMotion?.status === 'ready' ? mindmapMotion.mode : undefined;
  const discoveredRelationCount = readyFocus
    ? readyFocus.primaryRelated.length + readyFocus.secondaryRelated.length
    : 0;

  function getNodeType(nodeId: string): 'root' | 'primary' | 'secondary' | 'background' {
    if (!focusResult) return 'background';
    if (focusResult.rootNodeId === nodeId) return 'root';
    if (focusResult.primaryRelated.includes(nodeId)) return 'primary';
    if (focusResult.secondaryRelated.includes(nodeId)) return 'secondary';
    return 'background';
  }

  const selectedNode = nodes.find(node => node.id === selectedNodeId);
  const isCluster = Boolean(
    focusResult && selectedNodeId && (
      focusResult.rootNodeId === selectedNodeId ||
      focusResult.primaryRelated.includes(selectedNodeId) ||
      focusResult.secondaryRelated.includes(selectedNodeId)
    ),
  );

  let clusterData: {
    rootNode: MindNodeType;
    rootDetail: string | null;
    relatedNodes: RelatedNodeItem[];
  } | null = null;

  if (focusResult && isCluster && selectedNode) {
    const rootNode = nodes.find(node => node.id === focusResult.rootNodeId);
    if (rootNode) {
      const rootLive = itemMap.get(rootNode.itemId);
      clusterData = {
        rootNode: rootLive ? { ...rootNode, label: rootLive.summary } : rootNode,
        rootDetail: rootLive?.detail ?? (rootNode.detail || null),
        relatedNodes: [
          ...focusResult.primaryRelated,
          ...focusResult.secondaryRelated,
        ].map(id => {
          const node = nodes.find(item => item.id === id);
          if (!node) return null;
          const live = itemMap.get(node.itemId);
          return {
            node: live ? { ...node, label: live.summary } : node,
            detail: live?.detail ?? (node.detail || null),
            type: focusResult.primaryRelated.includes(id) ? 'primary' as const : 'secondary' as const,
          };
        }).filter((item): item is RelatedNodeItem => item !== null),
      };
    }
  }

  const paddedWidth = fittedLayout.width;
  const paddedHeight = fittedLayout.height;

  return (
    <main className="app-page min-h-[100dvh] pb-[72px] px-[24px]">
      <div className="mindmap-title-row pt-[var(--space-48)] pb-[var(--space-8)]">
        <h1 className="page-title">脑图</h1>
        <button className="mindmap-demo-entry" type="button" onClick={() => setIsDemoOpen(true)}>查看示例</button>
      </div>
      {nodes.length > 0 && (
        <p className="text-[13px] text-[var(--text-hint)] mb-[var(--space-24)]">
          {nodes.length} 个观点已沉淀
        </p>
      )}

      {isDemoOpen ? (
        <MindmapDemo onClose={handleCloseDemo} />
      ) : mindNodes === null && !loadError ? (
        <LoadingView />
      ) : mindNodes === null && loadError ? (
        <div className="text-center py-[var(--space-48)]">
          <p className="text-[14px] text-[var(--text-hint)] mb-[var(--space-16)]">加载失败</p>
          <button
            className="text-[14px] text-[var(--brand)] underline cursor-pointer bg-transparent border-none"
            onClick={retryLoad}
          >
            点击重试
          </button>
        </div>
      ) : nodes.length === 0 ? (
        <EmptyState lines={['还没有沉淀的想法', '笔记详情中点击 + 开始沉淀吧']} />
      ) : !preferencesReady ? (
        <LoadingView />
      ) : (
        <div
          className={`mindmap-scroll${isPanning ? ' mindmap-scroll--panning' : ''}`}
          style={{ position: 'relative' }}
          onPointerDown={handleCanvasPointerDown}
          onPointerMove={handleCanvasPointerMove}
          onPointerUp={handleCanvasPointerEnd}
          onPointerCancel={handleCanvasPointerEnd}
        >
          <svg
            width={paddedWidth}
            height={paddedHeight}
            style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}
          >
            {visibleEdges.map(edge => {
              const sourcePos = layout.get(edge.source);
              const targetPos = layout.get(edge.target);
              if (!sourcePos || !targetPos) return null;
              return (
                <line
                  key={`${edge.source}::${edge.target}`}
                  x1={sourcePos.x}
                  y1={sourcePos.y}
                  x2={targetPos.x}
                  y2={targetPos.y}
                  stroke="#D1CBB8"
                  strokeWidth={1}
                  className={`mindmap-edge${showLines ? ' mindmap-edge--visible' : ''}`}
                />
              );
            })}
          </svg>

          <div style={{ position: 'relative', width: paddedWidth, height: paddedHeight }}>
            {nodes.map(node => {
              const position = layout.get(node.id);
              if (!position) return null;
              return (
                <MindNode
                  key={node.id}
                  type={getNodeType(node.id)}
                  label={node.label}
                  x={position.x}
                  y={position.y}
                  motionMode={activeMotionMode}
                  highlighted={!selectedNodeId ? undefined : selectedNodeId === node.id}
                  onClick={() => handleNodeClick(node.id)}
                />
              );
            })}
          </div>

          {isFocusLoading && focus?.operation === 'initial' && !focus.result && (
            <div className="mindmap-preparing" role="status" aria-live="polite">
              <div className="mindmap-preparing-dots" aria-hidden="true"><span /><span /><span /></div>
              <p>Hunter 正在整理灵感…</p>
              <small>正在生成关联关系</small>
            </div>
          )}
          {isFocusLoading && focus?.operation === 'append' && (
            <p className="mindmap-update-status" role="status">发现新观点，正在更新关联</p>
          )}
        </div>
      )}

      {needsManualReanalysis && !readyFocus && !isFocusLoading && nodes.length >= 4 && (
        <div className="text-center mt-[var(--space-16)]">
          <button
            className="text-[14px] text-[var(--brand)] underline cursor-pointer bg-transparent border-none"
            onClick={() => {
              setNeedsManualReanalysis(false);
              void prepareMindmapFocus(nodes, { operation: 'initial' });
            }}
          >
            重新分析关联
          </button>
        </div>
      )}

      {selectedNode && !isCluster && (
        <ScatterOverlay
          node={(() => {
            const live = itemMap.get(selectedNode.itemId);
            return live ? { ...selectedNode, label: live.summary } : selectedNode;
          })()}
          detail={itemMap.get(selectedNode.itemId)?.detail ?? (selectedNode.detail || null)}
          onClose={handleCloseOverlay}
          onSetRoot={handleSetRoot}
          onDeleteNode={handleScatterDeleteClick}
        />
      )}

      {selectedNode && isCluster && clusterData && (
        <ClusterOverlay
          rootNode={clusterData.rootNode}
          rootDetail={clusterData.rootDetail}
          relatedNodes={clusterData.relatedNodes}
          highlightedNodeId={selectedNodeId}
          onClose={handleCloseOverlay}
          onSetRoot={handleSetRoot}
          onRemoveFromCluster={handleRemoveFromClusterClick}
          onDeleteRoot={setRootDeleteTarget}
        />
      )}

      <BottomNav />

      {(animation.phase === 'notice' || animation.phase === 'notice-leaving') && (
        <div
          className={`mindmap-formation-notice${animation.phase === 'notice-leaving' ? ' mindmap-formation-notice--leaving' : ''}`}
          role="status"
          aria-live="polite"
        >
          <span>✓</span>
          <span>Hunter已发现{discoveredRelationCount}条关联</span>
        </div>
      )}

      {clusterActionTarget && (
        <NodeActionDialog
          mode="cluster"
          onRemoveFromCluster={() => handleConfirmRemoveFromCluster(clusterActionTarget)}
          onDelete={() => handleDeleteNode(clusterActionTarget)}
          onCancel={() => setClusterActionTarget(null)}
        />
      )}

      {deleteTarget && (
        <NodeActionDialog
          mode="scatter"
          onDelete={() => handleDeleteNode(deleteTarget)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {rootDeleteTarget && (
        <NodeActionDialog
          mode="root"
          onDelete={() => void handleConfirmRootDelete(rootDeleteTarget)}
          onCancel={() => setRootDeleteTarget(null)}
        />
      )}

      {focus?.hash === hash && focus.status === 'error' && (
        <NodeActionDialog
          mode={focus.errorKind === 'read' ? 'retry-read' : 'retry-analysis'}
          onCancel={dismissMindmapError}
          onDelete={() => {
            if (focus.errorKind === 'read') {
              void ensureMindmapPreferences(true)
                .then(() => hydrateMindmapFocus(nodes, false))
                .then(() => setNeedsManualReanalysis(true))
                .catch(() => {
                  setNeedsManualReanalysis(true);
                  markMindmapReadError(nodes);
                });
              return;
            }
            const previous = focus.result;
            const classified = new Set(previous ? [
              previous.rootNodeId,
              ...previous.primaryRelated,
              ...previous.secondaryRelated,
              ...previous.backgroundNodes,
            ] : []);
            const newNodeId = nodes.find(node => !classified.has(node.id))?.id;
            void prepareMindmapFocus(nodes, focus.operation === 'append' && newNodeId
              ? { operation: 'append', newNodeId }
              : { operation: 'recluster' });
          }}
        />
      )}
    </main>
  );
}
