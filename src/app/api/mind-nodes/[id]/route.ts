import { dbDeleteMindNode, dbListMindNodes } from '@/lib/db';
import { validateSession } from '@/lib/auth';
import { logError } from '@/lib/logger';

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    const ctx = await validateSession(request);
    if (!ctx) {
      return Response.json({ error: '未认证', code: 401 }, { status: 401 });
    }
    const { id } = await params;

    const allNodes = await dbListMindNodes(ctx);
    if (!allNodes.some(n => n.id === id)) {
      return Response.json({ error: '节点不存在', code: 404 }, { status: 404 });
    }

    await dbDeleteMindNode(id, ctx);
    return new Response(null, { status: 204 });
  } catch {
    logError('MIND_NODE_DELETE_FAILED', { route: '/api/mind-nodes/:id', errorType: 'UNEXPECTED' });
    return Response.json(
      { error: '服务暂时不可用', code: 500 },
      { status: 500 }
    );
  }
}
