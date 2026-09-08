'use client';

import { useSyncExternalStore } from 'react';
import type { MindNode, Note } from '@/shared/types';
import { getNoteById, listMindNodes, listNotes, deleteMindNode as deleteMindNodeApi } from '@/lib/api';
import {
  buildFocusResult,
  completeFocusForNodes,
  nodesHash,
  type FocusApiResponse,
  type FocusResult,
} from '@/lib/mindmapLayout';

type FocusStatus = 'loading' | 'ready' | 'error';
export type FocusOperation = 'initial' | 'append' | 'recluster';
export type FocusErrorKind = 'read' | 'analysis';
export type MindmapMotionCause =
  | 'first-formation'
  | 'manual-root-change'
  | 'rebuild-after-empty'
  | 'node-added'
  | 'node-removed'
  | 'root-deleted';
export type MindmapMotionMode = 'full' | 'light';

export interface MindmapMotionIntent {
  id: number;
  cause: MindmapMotionCause;
  mode: MindmapMotionMode;
  status: 'pending' | 'ready' | 'completed';
}

interface FocusCacheEntry {
  hash: string;
  status: FocusStatus;
  result: FocusResult | null;
  operation?: FocusOperation;
  errorKind?: FocusErrorKind;
}

interface PreviousFocusInput {
  rootNodeId: string;
  primaryRelated: string[];
  secondaryRelated: string[];
  backgroundNodes: string[];
}

interface ClientDataCacheState {
  notes: Note[] | null;
  mindNodes: MindNode[] | null;
  focus: FocusCacheEntry | null;
  mindmapMotion: MindmapMotionIntent | null;
}

let state: ClientDataCacheState = {
  notes: null,
  mindNodes: null,
  focus: null,
  mindmapMotion: null,
};

const listeners = new Set<() => void>();
let notesRequest: Promise<Note[]> | null = null;
let mindNodesRequest: Promise<MindNode[]> | null = null;
let mindNodesGeneration = 0;
let cacheGeneration = 0;
let focusRequestSeq = 0;
let mindmapMotionSeq = 0;
let persistedFocusResult: FocusResult | null = null;
let persistedManualRootNodeId: string | null = null;
let persistedExcludedNodeIds: string[] = [];
let persistedHasEverAddedMindNode = false;
let activeFocusRequest: { key: string; promise: Promise<void> } | null = null;
let preferencesRequest: Promise<MindmapPreferences> | null = null;
let hasLoadedMindmapPreferences = false;

export interface MindmapPreferences {
  manualRootNodeId: string | null;
  excludedNodeIds: string[];
  focusResult: FocusResult | null;
  hasEverAddedMindNode: boolean;
}

function currentMindmapPreferences(): MindmapPreferences {
  return {
    manualRootNodeId: persistedManualRootNodeId,
    excludedNodeIds: persistedExcludedNodeIds,
    focusResult: persistedFocusResult,
    hasEverAddedMindNode: persistedHasEverAddedMindNode,
  };
}

// 仅供页面切换时首屏恢复使用：同一次登录会话内已读取过的偏好可立即使用，
// 随后仍由页面发起后台校验，避免把它当成永久缓存。
export function getCachedMindmapPreferences(): MindmapPreferences | null {
  return hasLoadedMindmapPreferences ? currentMindmapPreferences() : null;
}

function publish(next: Partial<ClientDataCacheState>) {
  state = { ...state, ...next };
  listeners.forEach(listener => listener());
}

function createMindmapMotion(cause: MindmapMotionCause, status: MindmapMotionIntent['status']): MindmapMotionIntent {
  const mode: MindmapMotionMode = (
    cause === 'first-formation'
    || cause === 'manual-root-change'
    || cause === 'rebuild-after-empty'
  ) ? 'full' : 'light';
  return { id: ++mindmapMotionSeq, cause, mode, status };
}

export function completeMindmapMotion(id: number): void {
  if (state.mindmapMotion?.id !== id || state.mindmapMotion.status !== 'ready') return;
  publish({ mindmapMotion: { ...state.mindmapMotion, status: 'completed' } });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return state;
}

export function useClientDataCache(): ClientDataCacheState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function setPersistedFocusResult(result: FocusResult | null) {
  persistedFocusResult = normalizePersistedFocus(result);
}

export function setPersistedMindmapPreferences(prefs: {
  manualRootNodeId?: string | null;
  excludedNodeIds?: string[];
  focusResult?: FocusResult | null;
  hasEverAddedMindNode?: boolean;
}) {
  if (prefs.manualRootNodeId !== undefined) {
    persistedManualRootNodeId = prefs.manualRootNodeId;
  }
  if (prefs.excludedNodeIds !== undefined) {
    persistedExcludedNodeIds = [...new Set(prefs.excludedNodeIds)];
  }
  if (prefs.hasEverAddedMindNode !== undefined) {
    persistedHasEverAddedMindNode = prefs.hasEverAddedMindNode;
  }
  // 最新的“设为根节点”操作覆盖此前“移出聚合图”的决定。
  if (persistedManualRootNodeId) {
    persistedExcludedNodeIds = persistedExcludedNodeIds.filter(id => id !== persistedManualRootNodeId);
  }
  if (prefs.focusResult !== undefined) {
    persistedFocusResult = normalizePersistedFocus(prefs.focusResult);
  } else {
    // 手动根节点或排除节点变化时，旧聚合结果也必须重新校验。
    persistedFocusResult = normalizePersistedFocus(persistedFocusResult);
  }
}

export async function ensureMindmapPreferences(force = false): Promise<MindmapPreferences> {
  if (preferencesRequest && !force) return preferencesRequest;

  preferencesRequest = fetch('/api/user/preferences')
    .then(async response => {
      if (!response.ok) throw new Error(`PREFERENCES_GET_FAILED:${response.status}`);
      const prefs = await response.json() as MindmapPreferences;
      setPersistedMindmapPreferences({
        manualRootNodeId: prefs.manualRootNodeId ?? null,
        excludedNodeIds: prefs.excludedNodeIds ?? [],
        focusResult: prefs.focusResult ?? null,
        hasEverAddedMindNode: prefs.hasEverAddedMindNode ?? false,
      });
      hasLoadedMindmapPreferences = true;
      return currentMindmapPreferences();
    })
    .finally(() => {
      preferencesRequest = null;
    });

  return preferencesRequest;
}

function normalizePersistedFocus(result: FocusResult | null): FocusResult | null {
  if (!result) return null;

  // 手动根节点、聚合根节点和排除节点必须保持同一份事实来源。
  if (
    (persistedManualRootNodeId && result.rootNodeId !== persistedManualRootNodeId)
    || persistedExcludedNodeIds.includes(result.rootNodeId)
  ) {
    return null;
  }

  const excluded = new Set(persistedExcludedNodeIds);
  const primaryRelated = result.primaryRelated.filter(id => !excluded.has(id));
  const secondaryRelated = result.secondaryRelated.filter(id => !excluded.has(id) && !primaryRelated.includes(id));
  const backgroundNodes = [...new Set([...result.backgroundNodes, ...persistedExcludedNodeIds])]
    .filter(id => id !== result.rootNodeId && !primaryRelated.includes(id) && !secondaryRelated.includes(id));

  return { rootNodeId: result.rootNodeId, primaryRelated, secondaryRelated, backgroundNodes };
}

async function persistFocusResultToServer(result: FocusResult) {
  const normalized = normalizePersistedFocus(result);
  if (!normalized) return;

  try {
    const response = await fetch('/api/user/preferences', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        manualRootNodeId: persistedManualRootNodeId,
        excludedNodeIds: persistedExcludedNodeIds,
        focusResult: normalized,
        hasEverAddedMindNode: persistedHasEverAddedMindNode,
      }),
    });
    if (!response.ok) return;
  } catch {
    // best-effort persistence, don't block UI
  }
}

export async function persistMindmapPreferences(): Promise<void> {
  const response = await fetch('/api/user/preferences', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      manualRootNodeId: persistedManualRootNodeId,
      excludedNodeIds: persistedExcludedNodeIds,
      focusResult: persistedFocusResult,
      hasEverAddedMindNode: persistedHasEverAddedMindNode,
    }),
  });
  if (!response.ok) throw new Error(`PREFERENCES_PUT_FAILED:${response.status}`);
}

export async function markMindmapNodeEverAdded(): Promise<void> {
  if (persistedHasEverAddedMindNode) return;
  persistedHasEverAddedMindNode = true;
  try {
    await persistMindmapPreferences();
  } catch {
    // 节点已成功创建；偏好同步失败不能回滚用户的真实操作。
  }
}

export function getCachedNote(id: string): Note | null {
  return state.notes?.find(note => note.id === id) ?? null;
}

export function ensureNotes(): Promise<Note[]> {
  if (state.notes) return Promise.resolve(state.notes);
  if (notesRequest) return notesRequest;

  const generation = cacheGeneration;
  notesRequest = listNotes()
    .then(notes => {
      if (generation === cacheGeneration) {
        publish({ notes });
      }
      return notes;
    })
    .finally(() => {
      notesRequest = null;
    });

  return notesRequest;
}

export function ensureNote(id: string): Promise<Note | null> {
  const cached = getCachedNote(id);
  if (cached) return Promise.resolve(cached);

  return getNoteById(id).then(note => {
    if (note) upsertCachedNote(note);
    return note;
  });
}

export function upsertCachedNote(note: Note) {
  const current = state.notes;
  if (!current) {
    publish({ notes: [note] });
    return;
  }

  const exists = current.some(item => item.id === note.id);
  const notes = exists
    ? current.map(item => item.id === note.id ? note : item)
    : [note, ...current];
  publish({ notes });
}

export function removeCachedNote(id: string) {
  if (!state.notes) return;
  publish({ notes: state.notes.filter(note => note.id !== id) });
}

export function ensureMindNodes(): Promise<MindNode[]> {
  if (state.mindNodes) return Promise.resolve(state.mindNodes);
  return refreshMindNodes();
}

export function refreshMindNodes(): Promise<MindNode[]> {
  if (mindNodesRequest) return mindNodesRequest;

  const requestGeneration = mindNodesGeneration;
  mindNodesRequest = listMindNodes()
    .then(nodes => {
      if (requestGeneration === mindNodesGeneration) {
        publish({ mindNodes: nodes });
      }
      return state.mindNodes ?? nodes;
    })
    .finally(() => {
      mindNodesRequest = null;
    });

  return mindNodesRequest;
}

export function addCachedMindNode(node: MindNode) {
  const nodes = state.mindNodes
    ? state.mindNodes.some(item => item.id === node.id)
      ? state.mindNodes
      : [...state.mindNodes, node]
    : [node];

  mindNodesGeneration += 1;
  publish({ mindNodes: nodes });
}

export function removeCachedMindNode(id: string) {
  if (!state.mindNodes) return;
  const nodes = state.mindNodes.filter(node => node.id !== id);
  mindNodesGeneration += 1;
  publish({ mindNodes: nodes });
}

export async function deleteNodeFromCache(nodeId: string): Promise<void> {
  await deleteMindNodeApi(nodeId);
  if (!state.mindNodes) return;
  const deletedRoot = persistedManualRootNodeId === nodeId
    || state.focus?.result?.rootNodeId === nodeId
    || persistedFocusResult?.rootNodeId === nodeId;
  const nodes = state.mindNodes.filter(node => node.id !== nodeId);
  mindNodesGeneration += 1;
  publish({ mindNodes: nodes });

  if (deletedRoot) {
    // 删除根节点时，整份关联快照失效；保留其他节点与用户的排除选择。
    persistedManualRootNodeId = null;
    persistedFocusResult = null;
    persistedExcludedNodeIds = persistedExcludedNodeIds.filter(id => id !== nodeId);
    publish({ focus: null, mindmapMotion: null });
    await persistMindmapPreferences();
    if (nodes.length >= 4) {
      await prepareMindmapFocus(nodes, { operation: 'recluster', reason: 'root-deleted' });
    }
    return;
  }

  // 非根节点删除只清理局部关系，不重新请求 AI。
  persistedExcludedNodeIds = persistedExcludedNodeIds.filter(id => id !== nodeId);
  if (persistedFocusResult) {
    persistedFocusResult = {
      rootNodeId: persistedFocusResult.rootNodeId,
      primaryRelated: persistedFocusResult.primaryRelated.filter(id => id !== nodeId),
      secondaryRelated: persistedFocusResult.secondaryRelated.filter(id => id !== nodeId),
      backgroundNodes: persistedFocusResult.backgroundNodes.filter(id => id !== nodeId),
    };
    publish({
      focus: { hash: nodesHash(nodes), status: 'ready', result: persistedFocusResult },
      mindmapMotion: createMindmapMotion('node-removed', 'ready'),
    });
  }
  await persistMindmapPreferences();
}

export async function syncMindNodesAndPrepareFocus(): Promise<MindNode[]> {
  const nodes = await refreshMindNodes();
  await hydrateMindmapFocus(nodes);
  return nodes;
}

export interface FocusOptions {
  forcedRootNodeId?: string;
  forcedBackgroundNodes?: string[];
  reason?: 'initial' | 'root-deleted';
  operation?: FocusOperation;
  newNodeId?: string;
  motionCause?: MindmapMotionCause;
}

function focusNodeIds(result: FocusResult): Set<string> {
  return new Set([
    result.rootNodeId,
    ...result.primaryRelated,
    ...result.secondaryRelated,
    ...result.backgroundNodes,
  ]);
}

function hasSameNodeSet(nodes: MindNode[], result: FocusResult): boolean {
  const currentIds = new Set(nodes.map(node => node.id));
  const savedIds = focusNodeIds(result);
  return currentIds.size === savedIds.size && [...currentIds].every(id => savedIds.has(id));
}

/**
 * 历史数据可能遗留已删除节点的排除标记或分类结果。
 * 在读取阶段将其收敛为当前节点集合，避免因一条失效 ID 反复触发全量 AI 分析。
 * 若根节点本身失效，则保留给后续“根节点失效”的正式重组流程处理。
 */
function repairPersistedFocusForNodes(nodes: MindNode[]): boolean {
  const nodeIds = new Set(nodes.map(node => node.id));
  let changed = false;

  const validExcluded = persistedExcludedNodeIds.filter(id => nodeIds.has(id));
  if (validExcluded.length !== persistedExcludedNodeIds.length) {
    persistedExcludedNodeIds = validExcluded;
    changed = true;
  }

  if (!persistedFocusResult || !nodeIds.has(persistedFocusResult.rootNodeId)) {
    return changed;
  }

  const raw = persistedFocusResult;
  const resultWithoutMissingNodes: FocusResult = {
    rootNodeId: raw.rootNodeId,
    primaryRelated: raw.primaryRelated.filter(id => nodeIds.has(id)),
    secondaryRelated: raw.secondaryRelated.filter(id => nodeIds.has(id)),
    backgroundNodes: raw.backgroundNodes.filter(id => nodeIds.has(id)),
  };
  const normalized = normalizePersistedFocus(resultWithoutMissingNodes);
  if (!normalized) return changed;

  const repaired = completeFocusForNodes(nodes, normalized);
  if (!hasSameNodeSet(nodes, raw)) changed = true;
  persistedFocusResult = repaired;
  return changed;
}

function setFocusError(
  hash: string,
  result: FocusResult | null,
  errorKind: FocusErrorKind,
  operation?: FocusOperation,
) {
  publish({ focus: { hash, status: 'error', result, errorKind, operation }, mindmapMotion: null });
}

export function dismissMindmapError() {
  if (!state.focus || state.focus.status !== 'error') return;
  if (state.focus.result) {
    publish({ focus: { ...state.focus, status: 'ready', errorKind: undefined } });
  } else {
    publish({ focus: null, mindmapMotion: null });
  }
}

export function markMindmapReadError(nodes: MindNode[]) {
  setFocusError(nodesHash(nodes), state.focus?.result ?? null, 'read');
}

export async function hydrateMindmapFocus(nodes: MindNode[], allowInitialAnalysis = true): Promise<void> {
  const hash = nodesHash(nodes);
  const nodeIds = new Set(nodes.map(node => node.id));

  // 自愈过往版本留下的失效 node ID。写回失败不应阻塞当前已经可用的聚合图。
  if (repairPersistedFocusForNodes(nodes)) {
    void persistMindmapPreferences().catch(() => {});
  }

  if (persistedManualRootNodeId && !nodeIds.has(persistedManualRootNodeId)) {
    persistedManualRootNodeId = null;
    persistedFocusResult = null;
    await persistMindmapPreferences();
    if (nodes.length >= 4) {
      await prepareMindmapFocus(nodes, { operation: 'recluster', reason: 'root-deleted' });
    }
    return;
  }

  if (persistedFocusResult && nodeIds.has(persistedFocusResult.rootNodeId) && hasSameNodeSet(nodes, persistedFocusResult)) {
    publish({ focus: { hash, status: 'ready', result: persistedFocusResult }, mindmapMotion: null });
    return;
  }

  if (allowInitialAnalysis && nodes.length >= 4) {
    await prepareMindmapFocus(nodes, { operation: 'initial' });
  } else {
    publish({ focus: null, mindmapMotion: null });
  }
}

export async function appendMindmapNode(nodeId: string): Promise<void> {
  const nodes = state.mindNodes ?? await ensureMindNodes();
  try {
    await ensureMindmapPreferences();
  } catch {
    setFocusError(nodesHash(nodes), state.focus?.result ?? null, 'read');
    return;
  }

  if (!persistedFocusResult || !nodes.some(node => node.id === persistedFocusResult!.rootNodeId)) {
    await hydrateMindmapFocus(nodes);
    return;
  }

  await prepareMindmapFocus(nodes, { operation: 'append', newNodeId: nodeId });
}

export async function prepareMindmapFocus(nodes: MindNode[], options?: FocusOptions): Promise<void> {
  if (nodes.length === 0) {
    publish({ focus: null, mindmapMotion: null });
    return;
  }

  const hash = nodesHash(nodes);
  const operation = options?.operation ?? (options?.reason === 'root-deleted' ? 'recluster' : 'initial');
  const motionCause = options?.motionCause
    ?? (operation === 'append'
      ? 'node-added'
      : options?.reason === 'root-deleted'
        ? 'root-deleted'
        : operation === 'recluster'
          ? 'manual-root-change'
          : persistedHasEverAddedMindNode
            ? 'rebuild-after-empty'
            : 'first-formation');
  const forcedRootId = options?.forcedRootNodeId
    ?? persistedManualRootNodeId
    ?? (operation === 'append' ? persistedFocusResult?.rootNodeId : undefined);
  const currentNodeIds = new Set(nodes.map(node => node.id));
  const forcedBackgroundNodes = (options?.forcedBackgroundNodes ?? persistedExcludedNodeIds)
    .filter(id => currentNodeIds.has(id));
  const requiresAnalysis = operation === 'append' || operation === 'recluster' || forcedRootId !== undefined || options?.reason === 'root-deleted';

  if (!requiresAnalysis && nodes.length < 4) {
    publish({ focus: null, mindmapMotion: null });
    return;
  }

  // 判断是否真正更换了 root（vs 只是加载已保存的状态 / 首次使用）
  const isGenuineRootChange = operation === 'recluster' || (forcedRootId !== undefined
    && persistedFocusResult !== null
    && forcedRootId !== persistedFocusResult.rootNodeId);

  // 仅在非 root 变更时才做早期返回（forcedBackgroundNodes 不影响——它们是已保存状态的一部分）
  if (!isGenuineRootChange && state.focus?.hash === hash && (state.focus.status === 'loading' || state.focus.status === 'ready')) {
    return;
  }

  // 尝试从持久化状态还原（无 AI）
  if (!isGenuineRootChange && persistedFocusResult) {
    const nodeIds = new Set(nodes.map(n => n.id));

    if (nodeIds.has(persistedFocusResult.rootNodeId)) {
      const persistedIds = new Set([
        persistedFocusResult.rootNodeId,
        ...persistedFocusResult.primaryRelated,
        ...persistedFocusResult.secondaryRelated,
        ...persistedFocusResult.backgroundNodes,
      ]);

      const hasNewNodes = nodes.some(n => !persistedIds.has(n.id));

      if (!hasNewNodes && hasSameNodeSet(nodes, persistedFocusResult)) {
        // 节点集合无变化 → 直接从持久化状态还原，不调 AI
        const cleanFocus: FocusResult = {
          rootNodeId: persistedFocusResult.rootNodeId,
          primaryRelated: persistedFocusResult.primaryRelated.filter(id => nodeIds.has(id)),
          secondaryRelated: persistedFocusResult.secondaryRelated.filter(id => nodeIds.has(id)),
          backgroundNodes: persistedFocusResult.backgroundNodes.filter(id => nodeIds.has(id)),
        };
        const classified = new Set([cleanFocus.rootNodeId, ...cleanFocus.primaryRelated, ...cleanFocus.secondaryRelated, ...cleanFocus.backgroundNodes]);
        for (const n of nodes) {
          if (!classified.has(n.id)) {
            cleanFocus.backgroundNodes.push(n.id);
          }
        }
        publish({ focus: { hash, status: 'ready', result: cleanFocus } });
        return;
      }
    } else {
      // 持久化 root 已被删除 → 清空持久化结果，走全量模式
      persistedFocusResult = null;
    }
  }

  // 确定 previousFocus：优先持久化 > 内存缓存
  // 仅当真正更换 root 时不传 previousFocus（全量重算）
  let previousFocus: PreviousFocusInput | null = null;
  if (!isGenuineRootChange) {
    const source = persistedFocusResult ?? state.focus?.result;
    if (source) {
      const forcedBgNodes = forcedBackgroundNodes;
      previousFocus = {
        rootNodeId: source.rootNodeId,
        primaryRelated: source.primaryRelated,
        secondaryRelated: source.secondaryRelated,
        backgroundNodes: source.backgroundNodes,
      };
      if (forcedBgNodes.length > 0) {
        const bgSet = new Set(forcedBgNodes);
        previousFocus.primaryRelated = previousFocus.primaryRelated.filter(id => !bgSet.has(id));
        previousFocus.secondaryRelated = previousFocus.secondaryRelated.filter(id => !bgSet.has(id));
      }
    }
  }

  const requestKey = [
    hash,
    operation,
    options?.newNodeId ?? '',
    forcedRootId ?? '',
    [...forcedBackgroundNodes].sort().join(','),
    options?.reason ?? '',
  ].join('|');
  if (activeFocusRequest?.key === requestKey) {
    return activeFocusRequest.promise;
  }

  const generation = cacheGeneration;
  const seq = ++focusRequestSeq;
  const previousResult = state.focus?.result ?? persistedFocusResult;
  const keepPreviousResult = operation === 'append' || operation === 'recluster';
  const motion = createMindmapMotion(motionCause, 'pending');
  publish({
    focus: {
      hash,
      status: 'loading',
      result: keepPreviousResult ? previousResult : null,
      operation,
    },
    mindmapMotion: motion,
  });

  const request = fetch('/api/mind-nodes/focus', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nodes: nodes.map(node => ({ id: node.id })),
        mode: operation === 'append' ? 'append' : 'full',
        newNodeId: options?.newNodeId,
        previousFocus: previousFocus ?? undefined,
        forcedRootNodeId: forcedRootId,
        forcedBackgroundNodes,
      }),
    })
    .then(async res => {
      if (!res.ok) throw new Error(`focus API 返回 ${res.status}`);
      return res.json() as Promise<FocusApiResponse>;
    })
    .then(data => {
      if (seq !== focusRequestSeq) return;
      if (generation !== cacheGeneration) return;
      const latestNodes = state.mindNodes ?? nodes;
      if (nodesHash(latestNodes) !== hash) return;

      let nextResult: FocusResult;
      if (operation === 'append' && options?.newNodeId && persistedFocusResult) {
        const newNodeId = options.newNodeId;
        const base = persistedFocusResult;
        const primaryRelated = data.primaryRelated.includes(newNodeId)
          ? [...base.primaryRelated, newNodeId]
          : base.primaryRelated;
        const secondaryRelated = !primaryRelated.includes(newNodeId) && data.secondaryRelated.includes(newNodeId)
          ? [...base.secondaryRelated, newNodeId]
          : base.secondaryRelated;
        const backgroundNodes = !primaryRelated.includes(newNodeId) && !secondaryRelated.includes(newNodeId)
          ? [...base.backgroundNodes, newNodeId]
          : base.backgroundNodes;
        nextResult = { rootNodeId: base.rootNodeId, primaryRelated, secondaryRelated, backgroundNodes };
      } else {
        nextResult = buildFocusResult(latestNodes, data);
      }
      const result = normalizePersistedFocus(nextResult);
      if (!result) {
        publish({ focus: null, mindmapMotion: null });
        return;
      }
      publish({ focus: { hash, status: 'ready', result, operation }, mindmapMotion: { ...motion, status: 'ready' } });
      persistedFocusResult = result;
      void persistFocusResultToServer(result);
    })
    .catch(() => {
      if (seq !== focusRequestSeq) return;
      if (generation !== cacheGeneration) return;
      setFocusError(hash, keepPreviousResult ? previousResult : null, 'analysis', operation);
      publish({ mindmapMotion: null });
    });

  activeFocusRequest = { key: requestKey, promise: request };
  try {
    await request;
  } finally {
    if (activeFocusRequest?.promise === request) {
      activeFocusRequest = null;
    }
  }
}

export async function moveNodeToBackground(nodeId: string): Promise<void> {
  if (!state.focus || state.focus.status !== 'ready' || !state.focus.result) return;

  const result = state.focus.result;
  if (result.rootNodeId === nodeId) return;

  const primaryRelated = result.primaryRelated.filter(id => id !== nodeId);
  const secondaryRelated = result.secondaryRelated.filter(id => id !== nodeId);
  const bgSet = new Set(result.backgroundNodes);
  bgSet.add(nodeId);

  const newResult: FocusResult = {
    ...result,
    primaryRelated,
    secondaryRelated,
    backgroundNodes: [...bgSet],
  };

  const motion = createMindmapMotion('node-removed', 'ready');
  publish({
    focus: {
      hash: state.focus.hash,
      status: 'ready',
      result: newResult,
    },
    mindmapMotion: motion,
  });

  persistedFocusResult = newResult;
  persistedExcludedNodeIds = [...new Set([...persistedExcludedNodeIds, nodeId])];
  await persistMindmapPreferences();
}

export async function setManualRootAndRecluster(nodes: MindNode[], nodeId: string): Promise<void> {
  persistedManualRootNodeId = nodeId;
  // 设为根节点优先于“移出聚合图”的历史选择。
  persistedExcludedNodeIds = persistedExcludedNodeIds.filter(id => id !== nodeId);
  // 旧图继续留在内存里，直到新的全量分类返回。
  persistedFocusResult = null;
  await persistMindmapPreferences();
  await prepareMindmapFocus(nodes, {
    operation: 'recluster',
    forcedRootNodeId: nodeId,
    forcedBackgroundNodes: persistedExcludedNodeIds,
    motionCause: 'manual-root-change',
  });
}

export function warmApplicationData() {
  void ensureNotes();
  void ensureMindNodes();
}

export function clearClientCache() {
  state = { notes: null, mindNodes: null, focus: null, mindmapMotion: null };
  notesRequest = null;
  mindNodesRequest = null;
  mindNodesGeneration += 1;
  cacheGeneration += 1;
  focusRequestSeq += 1;
  mindmapMotionSeq = 0;
  persistedFocusResult = null;
  persistedManualRootNodeId = null;
  persistedExcludedNodeIds = [];
  persistedHasEverAddedMindNode = false;
  hasLoadedMindmapPreferences = false;
  activeFocusRequest = null;
  listeners.forEach(listener => listener());
}
