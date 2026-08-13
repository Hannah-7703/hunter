import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MindNode } from '@/shared/types';

const mocks = vi.hoisted(() => ({
  listNotes: vi.fn(),
  listMindNodes: vi.fn(),
  getNoteById: vi.fn(),
  deleteMindNode: vi.fn(),
}));

vi.mock('react', () => ({
  useSyncExternalStore: (_subscribe: unknown, getSnapshot: () => unknown) => getSnapshot(),
}));
vi.mock('@/lib/api', () => ({
  listNotes: mocks.listNotes,
  listMindNodes: mocks.listMindNodes,
  getNoteById: mocks.getNoteById,
  deleteMindNode: mocks.deleteMindNode,
}));

import {
  clearClientCache,
  deleteNodeFromCache,
  prepareMindmapFocus,
  refreshMindNodes,
  removeNodeFromFocusCluster,
  useClientDataCache,
} from '@/lib/clientDataCache';

function node(id: string): MindNode {
  return { id, label: id, noteId: null, itemId: id, detail: '', date: '2026-01-01T00:00:00.000Z', user_id: 'test-user' };
}

function focusCalls(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.filter(([url]) => url === '/api/mind-nodes/focus');
}

describe('mindmap cluster state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearClientCache();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('keeps an unanalysed mindmap as scatter when no root exists', async () => {
    await prepareMindmapFocus([node('one'), node('two'), node('three')]);
    const state = useClientDataCache();
    expect(state.focus).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('uses one Focus request for a manual root and keeps excluded nodes in the request', async () => {
    const fetchMock = vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({
      rootNode: { id: 'root', label: 'root' },
      primaryRelated: ['related'],
      secondaryRelated: [],
      backgroundNodes: ['excluded', 'other'],
    })));
    const nodes = [node('root'), node('related'), node('excluded'), node('other')];

    await prepareMindmapFocus(nodes, { forcedRootNodeId: 'root', forcedBackgroundNodes: ['excluded'] });

    const calls = focusCalls(fetchMock);
    expect(calls).toHaveLength(1);
    expect(JSON.parse(String(calls[0][1]?.body))).toMatchObject({
      forcedRootNodeId: 'root',
      forcedBackgroundNodes: ['excluded'],
    });
  });

  it('moves a removed cluster node to background without another Focus request', async () => {
    const fetchMock = vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({
      rootNode: { id: 'root', label: 'root' },
      primaryRelated: ['related'],
      secondaryRelated: [],
      backgroundNodes: ['other'],
    })));
    const nodes = [node('root'), node('related'), node('other'), node('four')];
    await prepareMindmapFocus(nodes, { forcedRootNodeId: 'root' });
    removeNodeFromFocusCluster('related');

    const state = useClientDataCache();
    expect(state.focus?.result?.primaryRelated).toEqual([]);
    expect(state.focus?.result?.backgroundNodes).toContain('related');
    expect(focusCalls(fetchMock)).toHaveLength(1);
  });

  it('reclusters after deleting a root even when fewer than four nodes remain', async () => {
    const focusResponses = [
      { rootNode: { id: 'root', label: 'root' }, primaryRelated: ['remaining'], secondaryRelated: ['other'], backgroundNodes: ['four'] },
      { rootNode: { id: 'remaining', label: 'remaining' }, primaryRelated: ['other'], secondaryRelated: [], backgroundNodes: [] },
    ];
    const fetchMock = vi.mocked(fetch).mockImplementation((url) => {
      if (url === '/api/mind-nodes/focus') {
        return Promise.resolve(new Response(JSON.stringify(focusResponses.shift())));
      }
      return Promise.resolve(new Response(JSON.stringify({ success: true })));
    });
    const nodes = [node('root'), node('remaining'), node('other'), node('four')];
    mocks.listMindNodes.mockResolvedValue(nodes);
    await refreshMindNodes();
    await prepareMindmapFocus(nodes, { forcedRootNodeId: 'root' });
    await deleteNodeFromCache('root');

    expect(mocks.deleteMindNode).toHaveBeenCalledWith('root');
    expect(focusCalls(fetchMock)).toHaveLength(2);
    expect(useClientDataCache().focus?.result?.rootNodeId).toBe('remaining');
  });
});
