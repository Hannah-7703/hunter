import { validateSession } from '@/lib/auth';
import { dbCreateActivityEvent, type ActivityEventName } from '@/lib/db';
import { isVoiceFailureCode } from '@/lib/diagnostics';
import { logError } from '@/lib/logger';

const PRODUCT_EVENTS = new Set<ActivityEventName>(['mindmap_viewed', 'mindmap_node_opened']);

export async function POST(request: Request): Promise<Response> {
  const ctx = await validateSession(request);
  if (!ctx) {
    return Response.json({ error: '未认证', code: 'SESSION_INVALID' }, { status: 401 });
  }

  const body = await request.json().catch(() => null) as { failureCode?: unknown; event?: unknown } | null;
  if (isVoiceFailureCode(body?.failureCode)) {
    logError('VOICE_RECOGNITION_FAILED', {
      route: '/api/client-events',
      errorType: 'CLIENT_VOICE',
      failureCode: body.failureCode,
    });
    return new Response(null, { status: 204 });
  }

  if (typeof body?.event !== 'string' || !PRODUCT_EVENTS.has(body.event as ActivityEventName)) {
    return Response.json({ error: '无效事件' }, { status: 400 });
  }

  try {
    await dbCreateActivityEvent(body.event as ActivityEventName, ctx);
    return new Response(null, { status: 204 });
  } catch {
    logError('ACTIVITY_EVENT_CREATE_FAILED', {
      route: '/api/client-events',
      errorType: 'UNEXPECTED',
    });
    return new Response(null, { status: 204 });
  }
}
