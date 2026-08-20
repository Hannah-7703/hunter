import { DatabaseOperationError, dbVerifyInviteCode } from '@/lib/db';
import { createSession, setSessionCookie } from '@/lib/auth';
import { logError } from '@/lib/logger';

export async function POST(request: Request): Promise<Response> {
  try {
    const { code } = (await request.json()) as { code?: string };

    if (!code || typeof code !== 'string') {
      return Response.json(
        { success: false, error: '邀请码错误，认证失败', code: 'INVITE_INVALID' },
        { status: 400 }
      );
    }

    const cleaned = code
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');

    if (!cleaned) {
      return Response.json(
        { success: false, error: '邀请码错误，认证失败', code: 'INVITE_INVALID' },
        { status: 400 }
      );
    }

    const userUuid = await dbVerifyInviteCode(cleaned);

    if (!userUuid) {
      return Response.json(
        { success: false, error: '邀请码错误，认证失败', code: 'INVITE_INVALID' },
        { status: 401 }
      );
    }

    // 签发会话
    const token = await createSession(userUuid);
    const headers = new Headers();
    setSessionCookie(headers, token);

    return Response.json({ success: true }, { headers });
  } catch (error) {
    logError('INVITE_VERIFY_FAILED', {
      route: '/api/invite/verify',
      errorType: 'UNEXPECTED',
      databaseCode: error instanceof DatabaseOperationError ? error.databaseCode ?? undefined : undefined,
    });
    return Response.json(
      { success: false, error: '服务暂时不可用，请稍后重试', code: 'INVITE_UNAVAILABLE' },
      { status: 503 }
    );
  }
}
