import { createHash } from 'crypto';
import { dbRevokeSession } from '@/lib/db';
import { clearSessionCookie } from '@/lib/auth';
import { logError } from '@/lib/logger';

const COOKIE_NAME = 'hunter_session';

export async function POST(request: Request): Promise<Response> {
  try {
    const cookieHeader = request.headers.get('cookie');
    const match = cookieHeader?.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`));
    const token = match?.[1];

    if (token) {
      const tokenHash = createHash('sha256').update(token).digest('hex');
      await dbRevokeSession(tokenHash);
    }

    const headers = new Headers();
    clearSessionCookie(headers);
    return Response.json({ success: true }, { headers });
  } catch {
    logError('AUTH_LOGOUT_FAILED', { route: '/api/auth/logout', errorType: 'UNEXPECTED' });
    return Response.json({ error: '登出失败' }, { status: 500 });
  }
}
