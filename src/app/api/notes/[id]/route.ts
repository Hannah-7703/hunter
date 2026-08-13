import { dbGetNoteById, dbUpdateNote, dbDeleteNoteById } from '@/lib/db';
import { validateSession } from '@/lib/auth';
import { logError } from '@/lib/logger';
import type { Note } from '@/shared/types';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    const ctx = await validateSession(request);
    if (!ctx) {
      return Response.json({ error: '未认证', code: 401 }, { status: 401 });
    }
    const { id } = await params;
    const note: Note | null = await dbGetNoteById(id, ctx);
    if (!note) {
      return Response.json({ error: '笔记不存在', code: 404 }, { status: 404 });
    }
    return Response.json(note);
  } catch {
    logError('NOTE_GET_FAILED', { route: '/api/notes/:id', errorType: 'UNEXPECTED' });
    return Response.json(
      { error: '服务暂时不可用', code: 500 },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    const ctx = await validateSession(request);
    if (!ctx) {
      return Response.json({ error: '未认证', code: 401 }, { status: 401 });
    }
    const { id } = await params;
    const body = await request.json();

    const existing = await dbGetNoteById(id, ctx);
    if (!existing) {
      return Response.json({ error: '笔记不存在', code: 404 }, { status: 404 });
    }

    const updated = await dbUpdateNote(id, body, ctx);
    return Response.json(updated);
  } catch {
    logError('NOTE_UPDATE_FAILED', { route: '/api/notes/:id', errorType: 'UNEXPECTED' });
    return Response.json(
      { error: '服务暂时不可用', code: 500 },
      { status: 500 }
    );
  }
}

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

    const existing = await dbGetNoteById(id, ctx);
    if (!existing) {
      return Response.json({ error: '笔记不存在', code: 404 }, { status: 404 });
    }

    await dbDeleteNoteById(id, ctx);
    return new Response(null, { status: 204 });
  } catch {
    logError('NOTE_DELETE_FAILED', { route: '/api/notes/:id', errorType: 'UNEXPECTED' });
    return Response.json(
      { error: '服务暂时不可用', code: 500 },
      { status: 500 }
    );
  }
}
