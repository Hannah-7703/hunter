import { dbCreateMindNode, dbListMindNodes, dbGetNoteById } from '@/lib/db';
import { validateSession } from '@/lib/auth';
import { logError } from '@/lib/logger';
import type { MindNode } from '@/shared/types';

export async function GET(request: Request): Promise<Response> {
  try {
    const ctx = await validateSession(request);
    if (!ctx) {
      return Response.json({ error: '未认证', code: 401 }, { status: 401 });
    }
    const nodes: MindNode[] = await dbListMindNodes(ctx);
    return Response.json(nodes);
  } catch {
    logError('MIND_NODE_LIST_FAILED', { route: '/api/mind-nodes', errorType: 'UNEXPECTED' });
    return Response.json(
      { error: '服务暂时不可用', code: 500 },
      { status: 500 }
    );
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const ctx = await validateSession(request);
    if (!ctx) {
      return Response.json({ error: '未认证', code: 401 }, { status: 401 });
    }

    const body = await request.json();
    const { id, label, noteId, itemId, detail, date } = body as {
      id: string;
      label: string;
      noteId: string | null;
      itemId: string;
      detail: string;
      date: string;
    };

    // 校验 noteId 归属
    if (noteId) {
      const note = await dbGetNoteById(noteId, ctx);
      if (!note) {
        return Response.json({ error: '笔记不存在', code: 400 }, { status: 400 });
      }
    }

    // 0. 幂等检查
    const existingNodes = await dbListMindNodes(ctx);
    const existing = existingNodes.find(
      n => n.noteId === noteId && n.itemId === itemId
    );
    if (existing) {
      return Response.json(existing, { status: 200 });
    }

    // 1. DB 插入节点
    let newNode: MindNode;
    try {
      newNode = await dbCreateMindNode({
        id,
        label,
        noteId,
        itemId,
        detail: detail ?? '',
        date,
      }, ctx);
    } catch {
      logError('MIND_NODE_CREATE_FAILED', { route: '/api/mind-nodes', errorType: 'UNEXPECTED' });
      return Response.json(
        { error: '添加失败，请稍后重试', code: 500 },
        { status: 500 }
      );
    }

    return Response.json(newNode, { status: 201 });
  } catch {
    logError('MIND_NODE_CREATE_FAILED', { route: '/api/mind-nodes', errorType: 'UNEXPECTED' });
    return Response.json(
      { error: '服务暂时不可用', code: 500 },
      { status: 500 }
    );
  }
}
