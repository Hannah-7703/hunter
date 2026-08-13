import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  validateSession: vi.fn(),
  dbListNotes: vi.fn(),
  dbCreateNote: vi.fn(),
  dbGetNoteById: vi.fn(),
  dbUpdateNote: vi.fn(),
  dbDeleteNoteById: vi.fn(),
  dbListMindNodes: vi.fn(),
  dbCreateMindNode: vi.fn(),
  dbDeleteMindNode: vi.fn(),
  dbGetMindmapPreferences: vi.fn(),
  dbUpsertMindmapPreferences: vi.fn(),
  dbVerifyInviteCode: vi.fn(),
  dbRevokeSession: vi.fn(),
  createSession: vi.fn(),
  setSessionCookie: vi.fn(),
  clearSessionCookie: vi.fn(),
  listNotes: vi.fn(),
  listMindNodes: vi.fn(),
  getNoteById: vi.fn(),
  DatabaseOperationError: class DatabaseOperationError extends Error {
    readonly databaseCode: string | null;

    constructor(operation: string, databaseCode: string | null) {
      super(operation);
      this.databaseCode = databaseCode;
    }
  },
}));

vi.mock('@/lib/auth', () => ({
  validateSession: mocks.validateSession,
  createSession: mocks.createSession,
  setSessionCookie: mocks.setSessionCookie,
  clearSessionCookie: mocks.clearSessionCookie,
}));
vi.mock('@/lib/db', () => ({
  dbListNotes: mocks.dbListNotes,
  dbCreateNote: mocks.dbCreateNote,
  dbGetNoteById: mocks.dbGetNoteById,
  dbUpdateNote: mocks.dbUpdateNote,
  dbDeleteNoteById: mocks.dbDeleteNoteById,
  dbListMindNodes: mocks.dbListMindNodes,
  dbCreateMindNode: mocks.dbCreateMindNode,
  dbDeleteMindNode: mocks.dbDeleteMindNode,
  dbGetMindmapPreferences: mocks.dbGetMindmapPreferences,
  dbUpsertMindmapPreferences: mocks.dbUpsertMindmapPreferences,
  dbVerifyInviteCode: mocks.dbVerifyInviteCode,
  dbRevokeSession: mocks.dbRevokeSession,
  DatabaseOperationError: mocks.DatabaseOperationError,
}));
vi.mock('@/lib/logger', () => ({ logError: vi.fn(), logInfo: vi.fn() }));
vi.mock('@/lib/api', () => ({
  listNotes: mocks.listNotes,
  listMindNodes: mocks.listMindNodes,
  getNoteById: mocks.getNoteById,
}));

import { GET as getNotes } from '@/app/api/notes/route';
import { GET as getNote, PUT as updateNote, DELETE as deleteNote } from '@/app/api/notes/[id]/route';
import { GET as getNodes, POST as createNode } from '@/app/api/mind-nodes/route';
import { GET as getPreferences, PUT as putPreferences } from '@/app/api/user/preferences/route';
import { POST as verifyInvite } from '@/app/api/invite/verify/route';
import { clearClientCache, ensureNotes, getCachedNote } from '@/lib/clientDataCache';

const userA = { userId: 'user-a' };
const request = (url = 'http://test.local/api', init?: RequestInit) => new Request(url, init);
const noteParams = { params: Promise.resolve({ id: 'other-users-note' }) };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(res => { resolve = res; });
  return { promise, resolve };
}

describe('session and account isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearClientCache();
  });

  it('rejects protected note, mind-node, and preference routes without a session', async () => {
    mocks.validateSession.mockResolvedValue(null);

    const responses = await Promise.all([
      getNotes(request()),
      getNote(request(), noteParams),
      updateNote(request('http://test.local/api/notes/x', { method: 'PUT', body: '{}' }), noteParams),
      deleteNote(request('http://test.local/api/notes/x', { method: 'DELETE' }), noteParams),
      getNodes(request()),
      createNode(request('http://test.local/api/mind-nodes', { method: 'POST', body: '{}' })),
      getPreferences(request()),
      putPreferences(request('http://test.local/api/user/preferences', { method: 'PUT', body: '{}' })),
    ]);

    expect(responses.every(response => response.status === 401)).toBe(true);
    expect(mocks.dbListNotes).not.toHaveBeenCalled();
    expect(mocks.dbListMindNodes).not.toHaveBeenCalled();
  });

  it('does not read, update, or delete another users note when the scoped lookup is absent', async () => {
    mocks.validateSession.mockResolvedValue(userA);
    mocks.dbGetNoteById.mockResolvedValue(null);

    const [read, update, remove] = await Promise.all([
      getNote(request(), noteParams),
      updateNote(request('http://test.local/api/notes/x', { method: 'PUT', body: '{}' }), noteParams),
      deleteNote(request('http://test.local/api/notes/x', { method: 'DELETE' }), noteParams),
    ]);

    expect([read.status, update.status, remove.status]).toEqual([404, 404, 404]);
    expect(mocks.dbGetNoteById).toHaveBeenCalledWith('other-users-note', userA);
    expect(mocks.dbUpdateNote).not.toHaveBeenCalled();
    expect(mocks.dbDeleteNoteById).not.toHaveBeenCalled();
  });

  it('passes the authenticated user context to mind-node and preference storage', async () => {
    mocks.validateSession.mockResolvedValue(userA);
    mocks.dbListMindNodes.mockResolvedValue([]);
    mocks.dbGetMindmapPreferences.mockResolvedValue({ manualRootNodeId: null, excludedNodeIds: [] });
    mocks.dbUpsertMindmapPreferences.mockResolvedValue(undefined);

    await getNodes(request());
    await getPreferences(request());
    await putPreferences(request('http://test.local/api/user/preferences', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ manualRootNodeId: 'root', excludedNodeIds: ['background'] }),
    }));

    expect(mocks.dbListMindNodes).toHaveBeenCalledWith(userA);
    expect(mocks.dbGetMindmapPreferences).toHaveBeenCalledWith(userA);
    expect(mocks.dbUpsertMindmapPreferences).toHaveBeenCalledWith(userA, {
      manualRootNodeId: 'root',
      excludedNodeIds: ['background'],
    });
  });

  it('returns an error when mindmap preference storage cannot be read', async () => {
    mocks.validateSession.mockResolvedValue(userA);
    mocks.dbGetMindmapPreferences.mockRejectedValue(
      new mocks.DatabaseOperationError('MINDMAP_PREFERENCES_GET_FAILED', '42501'),
    );

    const response = await getPreferences(request());

    expect(response.status).toBe(500);
  });

  it.each(['inactive', 'expired', 'revoked'])('does not create a session for a %s invite', async () => {
    mocks.dbVerifyInviteCode.mockResolvedValue(null);
    const response = await verifyInvite(request('http://test.local/api/invite/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'TEST' }),
    }));

    expect(response.status).toBe(401);
    expect(mocks.createSession).not.toHaveBeenCalled();
  });

  it('does not republish a slow previous-session notes request after cache clear', async () => {
    const slow = deferred<Array<{ id: string }>>();
    mocks.listNotes.mockReturnValueOnce(slow.promise).mockResolvedValueOnce([{ id: 'new-note' }]);

    const previousRequest = ensureNotes();
    clearClientCache();
    slow.resolve([{ id: 'old-note' }]);
    await previousRequest;

    expect(getCachedNote('old-note')).toBeNull();
    await ensureNotes();
    expect(getCachedNote('new-note')).toEqual({ id: 'new-note' });
  });
});
