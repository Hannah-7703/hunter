'use client';

import { useSyncExternalStore } from 'react';
import type { MindNode, Note } from '@/shared/types';
import { getNoteById, listMindNodes, listNotes, deleteMindNode as deleteMindNodeApi } from '@/lib/api';
import {
  buildFocusResult,
  nodesHash,
  type FocusApiResponse,
  type FocusResult,
} from '@/lib/mindmapLayout';

type FocusStatus = 'loading' | 'ready' | 'error';

interface FocusCacheEntry {
  hash: string;
  status: FocusStatus;
  result: FocusResult | null;
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
}

let state: ClientDataCacheState = {
  notes: null,
  mindNodes: null,
  focus: null,
};

const listeners = new Set<() => void>();
let notesRequest: Promise<Note[]> | null = null;
let mindNodesRequest: Promise<MindNode[]> | null = null;
let mindNodesGeneration = 0;
let cacheGeneration = 0;
let focusRequestSeq = 0;
let persistedFocusResult: FocusResult | null = null;

function publish(next: Partial<ClientDataCacheState>) {
  state = { ...state, ...next };
  listeners.forEach(listener => listener());
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
  persistedFocusResult = result;
}

async function persistFocusResultToServer(result: FocusResult) {
  try {
    await fetch('/api/user/preferences', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ focusResult: result }),
    });
  } catch {
    // best-effort persistence, don't block UI
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
  void prepareMindmapFocus(nodes);
}

export function removeCachedMindNode(id: string) {
  if (!state.mindNodes) return;
  const nodes = state.mindNodes.filter(node => node.id !== id);
  mindNodesGeneration += 1;
  publish({ mindNodes: nodes });
  void prepareMindmapFocus(nodes);
}

export async function deleteNodeFromCache(nodeId: string): Promise<void> {
  await deleteMindNodeApi(nodeId);
  if (!state.mindNodes) return;
  const deletedRoot = state.focus?.result?.rootNodeId === nodeId
    || persistedFocusResult?.rootNodeId === nodeId;
  const nodes = state.mindNodes.filter(node => node.id !== nodeId);
  mindNodesGeneration += 1;
  publish({ mindNodes: nodes });

  if (persistedFocusResult && !deletedRoot) {
    const newPersisted: FocusResult = {
      rootNodeId: persistedFocusResult.rootNodeId,
      primaryRelated: persistedFocusResult.primaryRelated.filter(id => id !== nodeId),
      secondaryRelated: persistedFocusResult.secondaryRelated.filter(id => id !== nodeId),
      backgroundNodes: persistedFocusResult.backgroundNodes.filter(id => id !== nodeId),
    };
    persistedFocusResult = newPersisted;
    void persistFocusResultToServer(newPersisted);
  }

  if (deletedRoot) {
    persistedFocusResult = null;
    publish({ focus: null });
  }
  await prepareMindmapFocus(nodes, deletedRoot ? { reason: 'root-deleted' } : undefined);
}

export async function syncMindNodesAndPrepareFocus(): Promise<MindNode[]> {
  const nodes = await refreshMindNodes();
  await prepareMindmapFocus(nodes);
  return nodes;
}

export interface FocusOptions {
  forcedRootNodeId?: string;
  forcedBackgroundNodes?: string[];
  reason?: 'initial' | 'root-deleted';
}

export async function prepareMindmapFocus(nodes: MindNode[], options?: FocusOptions): Promise<void> {
  if (nodes.length === 0) {
    publish({ focus: null });
    return;
  }

  const hash = nodesHash(nodes);
  const forcedRootId = options?.forcedRootNodeId;
  const requiresAnalysis = forcedRootId !== undefined || options?.reason === 'root-deleted';

  if (!requiresAnalysis && nodes.length < 4) {
    publish({ focus: null });
    return;
  }

  // 判断是否真正更换了 root（vs 只是加载已保存的状态 / 首次使用）
  const isGenuineRootChange = forcedRootId !== undefined
    && persistedFocusResult !== null
    && forcedRootId !== persistedFocusResult.rootNodeId;

  // 仅在非 root 变更时才做早期返回（forcedBackgroundNodes 不影响——它们是已保存状态的一部分）
  if (!isGenuineRootChange && state.focus?.hash === hash && (state.focus.status === 'loading' || state.focus.status === 'ready')) {
    return;
  }

  const seq = ++focusRequestSeq;

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

      if (!hasNewNodes) {
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
      const forcedBgNodes = options?.forcedBackgroundNodes ?? [];
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

  const generation = cacheGeneration;
  publish({ focus: { hash, status: 'loading', result: null } });

  try {
    const res = await fetch('/api/mind-nodes/focus', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nodes: nodes.map(node => ({ id: node.id })),
        previousFocus: previousFocus ?? undefined,
        forcedRootNodeId: options?.forcedRootNodeId,
        forcedBackgroundNodes: options?.forcedBackgroundNodes,
      }),
    });

    if (!res.ok) throw new Error(`focus API 返回 ${res.status}`);

    const data = await res.json() as FocusApiResponse;
    if (seq !== focusRequestSeq) return;
    if (generation !== cacheGeneration) return;
    const latestNodes = state.mindNodes ?? nodes;
    if (nodesHash(latestNodes) !== hash) return;

    const result = buildFocusResult(latestNodes, data);
    publish({ focus: { hash, status: 'ready', result } });

    // 持久化到 DB
    persistedFocusResult = result;
    void persistFocusResultToServer(result);
  } catch {
    if (seq !== focusRequestSeq) return;
    if (generation !== cacheGeneration) return;
    publish({ focus: null });
  }
}

export function removeNodeFromFocusCluster(nodeId: string) {
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

  publish({
    focus: {
      hash: state.focus.hash,
      status: 'ready',
      result: newResult,
    },
  });

  persistedFocusResult = newResult;
  void persistFocusResultToServer(newResult);
}

export function warmApplicationData() {
  void ensureNotes();
  void ensureMindNodes().then(async nodes => {
    if (nodes.length < 4) return;
    try {
      const res = await fetch('/api/user/preferences');
      if (res.ok) {
        const prefs = await res.json();
        if (prefs.focusResult) {
          persistedFocusResult = prefs.focusResult;
        }
        void prepareMindmapFocus(nodes, {
          forcedRootNodeId: (prefs.manualRootNodeId as string) ?? undefined,
          forcedBackgroundNodes: (prefs.excludedNodeIds as string[]) ?? undefined,
        });
      }
    } catch { /* prefs fetch failed, page useEffect will handle it */ }
  });
}

export function clearClientCache() {
  state = { notes: null, mindNodes: null, focus: null };
  notesRequest = null;
  mindNodesRequest = null;
  mindNodesGeneration += 1;
  cacheGeneration += 1;
  focusRequestSeq += 1;
  persistedFocusResult = null;
  listeners.forEach(listener => listener());
}
