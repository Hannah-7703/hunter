import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  validateSession: vi.fn(),
  deepseekChat: vi.fn(),
  dbListMindNodes: vi.fn(),
  enrichNodeContexts: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ validateSession: mocks.validateSession }));
vi.mock('@/lib/deepseekClient', () => ({ deepseekChat: mocks.deepseekChat }));
vi.mock('@/lib/db', () => ({ dbListMindNodes: mocks.dbListMindNodes }));
vi.mock('@/lib/nodeContext', () => ({ enrichNodeContexts: mocks.enrichNodeContexts }));
vi.mock('@/lib/logger', () => ({ logError: vi.fn(), logInfo: vi.fn() }));

import { POST as phaseA } from '@/app/api/process/phase-a/route';
import { POST as phaseB } from '@/app/api/process/phase-b/route';
import { POST as focus } from '@/app/api/mind-nodes/focus/route';

const request = (body: unknown) => new Request('http://test.local/api', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});
const session = { userId: 'test-user' };
const phaseAResponse = JSON.stringify({ hasSubstance: false });
const phaseBResponse = JSON.stringify({ question: [], breakdown: [], expand: [] });

describe('AI call budget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.validateSession.mockResolvedValue(session);
  });

  it('calls Phase A once on success and never uses network outside the DeepSeek mock', async () => {
    mocks.deepseekChat.mockResolvedValue({ content: phaseAResponse });
    const response = await phaseA(request({ content: 'test input', fromVoice: false }));
    expect(response.status).toBe(200);
    expect(mocks.deepseekChat).toHaveBeenCalledTimes(1);
    expect(mocks.deepseekChat.mock.calls[0][1]).toMatchObject({ max_tokens: 1536, timeout: 30000 });
  });

  it('calls Phase B once on success', async () => {
    mocks.deepseekChat.mockResolvedValue({ content: phaseBResponse });
    const response = await phaseB(request({ original: 'test input', keyPoints: [{ id: 'k', summary: 'point', detail: '' }] }));
    expect(response.status).toBe(200);
    expect(mocks.deepseekChat).toHaveBeenCalledTimes(1);
    expect(mocks.deepseekChat.mock.calls[0][1]).toMatchObject({ max_tokens: 4096, timeout: 30000 });
  });

  it.each([
    ['Phase A', phaseA, { content: 'test input', fromVoice: false }],
    ['Phase B', phaseB, { original: 'test input', keyPoints: [{ id: 'k', summary: 'point', detail: '' }] }],
  ] as const)('retries %s at most once after an upstream error', async (_name, handler, body) => {
    mocks.deepseekChat.mockResolvedValueOnce({ error: 'temporary' }).mockResolvedValueOnce({ content: _name === 'Phase A' ? phaseAResponse : phaseBResponse });
    const response = await handler(request(body));
    expect(response.status).toBe(200);
    expect(mocks.deepseekChat).toHaveBeenCalledTimes(2);
  });

  it('does not call AI for an empty Phase A request', async () => {
    const response = await phaseA(request({ content: '', fromVoice: false }));
    expect(response.status).toBe(200);
    expect(mocks.deepseekChat).not.toHaveBeenCalled();
  });

  it('calls Focus exactly once when a user manually selects a root', async () => {
    const nodes = ['root', 'one', 'two', 'three'].map(id => ({ id, label: id, noteId: null, itemId: id, detail: '' }));
    mocks.dbListMindNodes.mockResolvedValue(nodes);
    mocks.enrichNodeContexts.mockResolvedValue(new Map(nodes.map(node => [node.id, {
      id: node.id,
      summary: node.label,
      detail: '',
      noteTitle: null,
    }])));
    mocks.deepseekChat.mockResolvedValue({ content: JSON.stringify({ primaryRelated: ['one'], secondaryRelated: [], backgroundNodes: ['two', 'three'] }) });

    const response = await focus(request({ nodes: nodes.map(node => ({ id: node.id })), forcedRootNodeId: 'root' }));
    expect(response.status).toBe(200);
    expect(mocks.deepseekChat).toHaveBeenCalledTimes(1);
    expect(mocks.deepseekChat.mock.calls[0][1]).toMatchObject({ max_tokens: 2048, timeout: 25000 });
  });
});
