import { DatabaseOperationError, dbGetMindmapPreferences, dbUpsertMindmapPreferences } from '@/lib/db';
import { validateSession } from '@/lib/auth';
import { logError } from '@/lib/logger';

export async function GET(request: Request): Promise<Response> {
  try {
    const ctx = await validateSession(request);
    if (!ctx) {
      return Response.json({ error: '未认证', code: 401 }, { status: 401 });
    }

    const prefs = await dbGetMindmapPreferences(ctx);
    return Response.json(prefs);
  } catch (error) {
    logError('USER_PREFS_GET_FAILED', {
      route: '/api/user/preferences',
      errorType: 'UNEXPECTED',
      databaseCode: error instanceof DatabaseOperationError ? error.databaseCode ?? undefined : undefined,
    });
    return Response.json(
      { error: '服务暂时不可用', code: 500 },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request): Promise<Response> {
  try {
    const ctx = await validateSession(request);
    if (!ctx) {
      return Response.json({ error: '未认证', code: 401 }, { status: 401 });
    }

    const body = (await request.json()) as {
      manualRootNodeId?: string | null;
      excludedNodeIds?: string[];
      focusResult?: {
        rootNodeId: string;
        primaryRelated: string[];
        secondaryRelated: string[];
        backgroundNodes: string[];
      } | null;
    };

    await dbUpsertMindmapPreferences(ctx, {
      manualRootNodeId: body.manualRootNodeId,
      excludedNodeIds: body.excludedNodeIds,
      focusResult: body.focusResult,
    });

    return Response.json({ success: true });
  } catch (error) {
    logError('USER_PREFS_PUT_FAILED', {
      route: '/api/user/preferences',
      errorType: 'UNEXPECTED',
      databaseCode: error instanceof DatabaseOperationError ? error.databaseCode ?? undefined : undefined,
    });
    return Response.json(
      { error: '服务暂时不可用', code: 500 },
      { status: 500 }
    );
  }
}
