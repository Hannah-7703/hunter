import { validateSession } from '@/lib/auth';

export async function GET(request: Request): Promise<Response> {
  const ctx = await validateSession(request);
  return Response.json({ authenticated: Boolean(ctx) });
}
