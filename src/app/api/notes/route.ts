import { dbCreateNote, dbListNotes } from '@/lib/db';
import { validateSession } from '@/lib/auth';
import { logError } from '@/lib/logger';
import type { Note } from '@/shared/types';

export async function GET(request: Request): Promise<Response> {
  try {
    const ctx = await validateSession(request);
    if (!ctx) {
      return Response.json({ error: '未认证', code: 401 }, { status: 401 });
    }
    const notes: Note[] = await dbListNotes(ctx);
    return Response.json(notes);
  } catch {
    logError('NOTE_LIST_FAILED', { route: '/api/notes', errorType: 'UNEXPECTED' });
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
    const note = await dbCreateNote(body, ctx);
    return Response.json(note, { status: 201 });
  } catch {
    logError('NOTE_CREATE_FAILED', { route: '/api/notes', errorType: 'UNEXPECTED' });
    return Response.json(
      { error: '服务暂时不可用', code: 500 },
      { status: 500 }
    );
  }
}
