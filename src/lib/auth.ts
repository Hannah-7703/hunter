import { createHash, randomBytes } from 'crypto';
import { dbValidateSession, dbCreateSession } from '@/lib/db';
import type { RequestContext } from '@/shared/types';

const COOKIE_NAME = 'hunter_session';
const SESSION_MAX_AGE = 7 * 24 * 60 * 60; // 7 天（秒）

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function generateSessionToken(): string {
  return randomBytes(32).toString('hex');
}

export async function validateSession(request: Request): Promise<RequestContext | null> {
  const cookieHeader = request.headers.get('cookie');
  if (!cookieHeader) return null;

  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`));
  const token = match?.[1];
  if (!token) return null;

  const userId = await dbValidateSession(hashToken(token));
  if (!userId) return null;

  return { userId };
}

export async function createSession(userUuid: string): Promise<string> {
  const token = generateSessionToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE * 1000).toISOString();
  await dbCreateSession(userUuid, tokenHash, expiresAt);
  return token;
}

export function setSessionCookie(headers: Headers, token: string): void {
  headers.set(
    'Set-Cookie',
    `${COOKIE_NAME}=${token}; HttpOnly; Path=/; Max-Age=${SESSION_MAX_AGE}; SameSite=Lax`
  );
}

export function clearSessionCookie(headers: Headers): void {
  headers.set(
    'Set-Cookie',
    `${COOKIE_NAME}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`
  );
}
