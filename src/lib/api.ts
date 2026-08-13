import type { Note, CreateNoteInput, UpdateNoteInput, MindNode, CreateMindNodeInput } from '@/shared/types';

async function fetchApi<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers as Record<string, string> || {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: '未知错误' }));
    throw new Error(err.error || '请求失败');
  }
  return res.json();
}

// ====== 笔记 ======

export async function createNote(data: CreateNoteInput): Promise<Note> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  return fetchApi<Note>('/api/notes', {
    method: 'POST',
    body: JSON.stringify({ ...data, id, createdAt: now, updatedAt: now }),
  });
}

export async function getNoteById(id: string): Promise<Note | null> {
  const res = await fetch('/api/notes/' + id);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('获取笔记失败');
  return res.json();
}

export async function listNotes(): Promise<Note[]> {
  return fetchApi<Note[]>('/api/notes');
}

export async function updateNote(id: string, data: UpdateNoteInput): Promise<Note> {
  return fetchApi<Note>('/api/notes/' + id, {
    method: 'PUT',
    body: JSON.stringify({ ...data, updatedAt: new Date().toISOString() }),
  });
}

export async function deleteNoteById(id: string): Promise<void> {
  const res = await fetch('/api/notes/' + id, { method: 'DELETE' });
  if (!res.ok) throw new Error('删除笔记失败');
}

// ====== 脑图节点 ======

export async function createMindNode(data: CreateMindNodeInput & { detail?: string }): Promise<MindNode> {
  const id = crypto.randomUUID();
  return fetchApi<MindNode>('/api/mind-nodes', {
    method: 'POST',
    body: JSON.stringify({ ...data, id }),
  });
}

export async function listMindNodes(): Promise<MindNode[]> {
  return fetchApi<MindNode[]>('/api/mind-nodes');
}

export async function deleteMindNode(id: string): Promise<void> {
  const res = await fetch('/api/mind-nodes/' + id, { method: 'DELETE' });
  if (!res.ok) throw new Error('删除节点失败');
}
