'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { MindNode as MindNodeType, Note } from '@/shared/types';
import {
  ensureMindNodes,
  ensureNotes,
  prepareMindmapFocus,
  removeNodeFromFocusCluster,
  useClientDataCache,
  deleteNodeFromCache,
  setPersistedFocusResult,
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
import { showToast } from '@/components/ui/Toast';

const SVG_WIDTH = 720;
const SVG_HEIGHT = 900;
const PAD = 80;

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
    for (const tab of ['question', 'breakdown', 'expand'] as const) {
      for (const item of note.deepThinking[tab]) {
        map.set(item.id, { summary: item.summary, detail: item.detail });
      }
    }
  }
  return map;
}

export default function MindMapPage() {
  const { notes, mindNodes, focus } = useClientDataCache();
  const nodes = useMemo(() => mindNodes ?? [], [mindNodes]);
  const [selectedFocusResult, setSelectedFocusResult] = useState<FocusResult | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [linesHash, setLinesHash] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [forcedBackgroundNodeIds, setForcedBackgroundNodeIds] = useState<Set<string>>(new Set());
  const [clusterActionTarget, setClusterActionTarget] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [rootDeleteTarget, setRootDeleteTarget] = useState<string | null>(null);
  const [isSavingRoot, setIsSavingRoot] = useState(false);
  const [isDeletingRoot, setIsDeletingRoot] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const panRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    scrollLeft: number;
    scrollTop: number;
    moved: boolean;
    startedOnNode: boolean;
  } | null>(null);
  const ignoreNodeClickRef = useRef(false);

  const hash = useMemo(() => nodesHash(nodes), [nodes]);
  const readyFocus = focus?.hash === hash && focus.status === 'ready' ? focus.result : null;
  const isFocusLoading =
    (focus?.hash === hash && focus.status === 'loading') ||
    (focus === null && nodes.length >= 4);
  const itemMap = useMemo(() => buildItemMap(notes), [notes]);

  useEffect(() => {
    void ensureNotes();
    Promise.all([
      ensureMindNodes(),
      fetch('/api/user/preferences').then(r => r.ok ? r.json() : null).catch(() => null),
    ]).then(([nodes, prefs]) => {
      if (prefs?.excludedNodeIds?.length) {
        setForcedBackgroundNodeIds(new Set(prefs.excludedNodeIds as string[]));
      }
      if (prefs?.focusResult) {
        setPersistedFocusResult(prefs.focusResult);
      }
      return prepareMindmapFocus(nodes, {
        forcedRootNodeId: (prefs?.manualRootNodeId as string) ?? undefined,
        forcedBackgroundNodes: (prefs?.excludedNodeIds as string[]) ?? undefined,
      });
    }).catch(() => setLoadError(true));
  }, []);

  function retryLoad() {
    setLoadError(false);
    ensureMindNodes()
      .then(nodes => prepareMindmapFocus(nodes))
      .catch(() => setLoadError(true));
  }

  useEffect(() => {
    if (!readyFocus) return;
    const timer = window.setTimeout(() => setLinesHash(hash), 500);
    return () => window.clearTimeout(timer);
  }, [hash, readyFocus]);

  function handleCloseOverlay() {
    setSelectedNodeId(null);
    setSelectedFocusResult(null);
  }

  function handleNodeClick(nodeId: string) {
    if (ignoreNodeClickRef.current) {
      ignoreNodeClickRef.current = false;
      return;
    }
    setSelectedFocusResult(readyFocus);
    setSelectedNodeId(nodeId);
  }

  function handleCanvasPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const container = event.currentTarget;
    panRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      scrollLeft: container.scrollLeft,
      scrollTop: container.scrollTop,
      moved: false,
      startedOnNode: (event.target as Element).closest('button') !== null,
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
    if (pan.moved && pan.startedOnNode) ignoreNodeClickRef.current = true;
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
      const response = await fetch('/api/user/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ manualRootNodeId: nodeId }),
      });
      if (!response.ok) throw new Error('PREFERENCE_SAVE_FAILED');

      setSelectedNodeId(null);
      setSelectedFocusResult(null);
      await prepareMindmapFocus(nodes, {
        forcedRootNodeId: nodeId,
        forcedBackgroundNodes: [...forcedBackgroundNodeIds],
      });
    } catch {
      showToast('根节点保存失败，请重试', 'error');
    } finally {
      setIsSavingRoot(false);
    }
  }

  function handleRemoveFromClusterClick(nodeId: string) {
    setClusterActionTarget(nodeId);
  }

  function handleConfirmRemoveFromCluster(nodeId: string) {
    const next = new Set(forcedBackgroundNodeIds);
    next.add(nodeId);
    setForcedBackgroundNodeIds(next);

    const nextArr = [...next];
    fetch('/api/user/preferences', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ excludedNodeIds: nextArr }),
    }).catch(() => {});

    removeNodeFromFocusCluster(nodeId);
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
    if (forcedBackgroundNodeIds.has(nodeId)) {
      const next = new Set(forcedBackgroundNodeIds);
      next.delete(nodeId);
      setForcedBackgroundNodeIds(next);
    }
  }

  function handleScatterDeleteClick(nodeId: string) {
    setDeleteTarget(nodeId);
  }

  async function handleConfirmRootDelete(nodeId: string) {
    if (isDeletingRoot) return;
    setIsDeletingRoot(true);

    try {
      const response = await fetch('/api/user/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ manualRootNodeId: null, focusResult: null }),
      });
      if (!response.ok) throw new Error('PREFERENCE_CLEAR_FAILED');

      setPersistedFocusResult(null);
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
  const showLines = Boolean(focusResult && linesHash === hash);

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
      <h1 className="page-title pt-[var(--space-48)] pb-[var(--space-8)]">脑图</h1>
      {nodes.length > 0 && (
        <p className="text-[13px] text-[var(--text-hint)] mb-[var(--space-24)]">
          {nodes.length} 个观点已沉淀
        </p>
      )}

      {mindNodes === null && !loadError ? (
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
            {showLines && visibleEdges.map(edge => {
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
                  highlighted={!selectedNodeId ? undefined : selectedNodeId === node.id}
                  onClick={() => handleNodeClick(node.id)}
                />
              );
            })}
          </div>

          {isFocusLoading && (
            <div className="mindmap-preparing" role="status" aria-live="polite">
              <div className="mindmap-preparing-dots" aria-hidden="true"><span /><span /><span /></div>
              <p>Hunter 正在整理灵感…</p>
              <small>正在生成关联关系</small>
            </div>
          )}
        </div>
      )}

      {focus?.hash === hash && focus.status === 'error' && nodes.length > 0 && (
        <p className="text-center text-[13px] text-[var(--text-hint)] mt-[var(--space-16)]">
          暂未生成关联关系，已为你展示基础结构
        </p>
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
    </main>
  );
}
