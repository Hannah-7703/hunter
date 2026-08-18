import { validateSession } from '@/lib/auth';
import { isVoiceFailureCode } from '@/lib/diagnostics';
import { logError } from '@/lib/logger';

export async function POST(request: Request): Promise<Response> {
  const ctx = await validateSession(request);
  if (!ctx) {
    return Response.json({ error: '未认证', code: 'SESSION_INVALID' }, { status: 401 });
  }

  const body = await request.json().catch(() => null) as { failureCode?: unknown } | null;
  if (!isVoiceFailureCode(body?.failureCode)) {
    return Response.json({ error: '无效事件' }, { status: 400 });
  }

  logError('VOICE_RECOGNITION_FAILED', {
    route: '/api/client-events',
    errorType: 'CLIENT_VOICE',
    failureCode: body.failureCode,
  });
  return new Response(null, { status: 204 });
}
