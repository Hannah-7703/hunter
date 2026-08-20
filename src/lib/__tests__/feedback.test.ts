import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  validateSession: vi.fn(),
  dbCreateAnonymousFeedback: vi.fn(),
  logError: vi.fn(),
  logInfo: vi.fn(),
  DatabaseOperationError: class DatabaseOperationError extends Error {
    readonly databaseCode: string | null;

    constructor(operation: string, databaseCode: string | null) {
      super(operation);
      this.databaseCode = databaseCode;
    }
  },
}));

vi.mock('@/lib/auth', () => ({ validateSession: mocks.validateSession }));
vi.mock('@/lib/db', () => ({
  dbCreateAnonymousFeedback: mocks.dbCreateAnonymousFeedback,
  DatabaseOperationError: mocks.DatabaseOperationError,
}));
vi.mock('@/lib/logger', () => ({ logError: mocks.logError, logInfo: mocks.logInfo }));

import { POST } from '@/app/api/feedback/route';

const request = (body: unknown) => new Request('http://test.local/api/feedback', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

describe('anonymous feedback route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.validateSession.mockResolvedValue({ userId: 'a-valid-session-user' });
    mocks.dbCreateAnonymousFeedback.mockResolvedValue(undefined);
  });

  it('requires a valid session but never passes a user id to storage', async () => {
    const response = await POST(request({ category: '体验建议', content: '希望更方便使用', page: 'mindmap' }));

    expect(response.status).toBe(201);
    expect(mocks.dbCreateAnonymousFeedback).toHaveBeenCalledWith({
      category: '体验建议',
      content: '希望更方便使用',
      page: 'mindmap',
    });
    expect(JSON.stringify(mocks.dbCreateAnonymousFeedback.mock.calls)).not.toContain('a-valid-session-user');
  });

  it('rejects unauthenticated submissions', async () => {
    mocks.validateSession.mockResolvedValue(null);

    const response = await POST(request({ content: '反馈', page: 'capture' }));

    expect(response.status).toBe(401);
    expect(mocks.dbCreateAnonymousFeedback).not.toHaveBeenCalled();
  });

  it.each([
    { content: '', page: 'capture' },
    { content: 'x'.repeat(501), page: 'capture' },
    { content: '有效内容', page: 'unknown' },
    { category: '无效分类', content: '有效内容', page: 'capture' },
  ])('rejects invalid feedback payloads', async (body) => {
    const response = await POST(request(body));

    expect(response.status).toBe(400);
    expect(mocks.dbCreateAnonymousFeedback).not.toHaveBeenCalled();
  });

  it('logs only safe metadata when storage fails', async () => {
    mocks.dbCreateAnonymousFeedback.mockRejectedValue(
      new mocks.DatabaseOperationError('FEEDBACK_CREATE_FAILED', '42501'),
    );

    const response = await POST(request({ content: '这段反馈不应进入日志', page: 'capture' }));

    expect(response.status).toBe(503);
    expect(mocks.logError).toHaveBeenCalledWith('FEEDBACK_SUBMIT_FAILED', {
      route: '/api/feedback',
      errorType: 'UNEXPECTED',
      databaseCode: '42501',
    });
    expect(JSON.stringify(mocks.logError.mock.calls)).not.toContain('这段反馈不应进入日志');
  });
});
