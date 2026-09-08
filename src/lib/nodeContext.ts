import { dbListNotes } from './db';
import type { Note, MindNode, RequestContext } from '@/shared/types';

export interface EnrichedNodeContext {
  id: string;
  noteTitle: string | null;
  summary: string;
  detail: string | null;
}

function findItemDetail(note: Note, itemId: string): string | null {
  for (const kp of note.keyPoints) {
    if (kp.id === itemId) return kp.detail;
  }
  if (note.deepThinking.emotionInsight?.present && note.deepThinking.emotionInsight.id === itemId) {
    return note.deepThinking.emotionInsight.detail;
  }
  for (const tab of ['question', 'breakdown', 'expand'] as const) {
    for (const item of note.deepThinking[tab]) {
      if (item.id === itemId) return item.detail;
    }
  }
  return null;
}

export async function enrichNodeContexts(
  nodes: Pick<MindNode, 'id' | 'label' | 'noteId' | 'itemId' | 'detail'>[],
  context: RequestContext
): Promise<Map<string, EnrichedNodeContext>> {
  const allNotes = await dbListNotes(context);
  const noteMap = new Map<string, Note>();
  for (const note of allNotes) {
    noteMap.set(note.id, note);
  }

  const result = new Map<string, EnrichedNodeContext>();

  for (const node of nodes) {
    const note = node.noteId ? noteMap.get(node.noteId) : undefined;
    const noteTitle = note?.title ?? null;

    let detail: string | null = null;
    if (note && node.itemId) {
      detail = findItemDetail(note, node.itemId);
    }
    if (!detail && node.detail) {
      detail = node.detail;
    }

    if (detail && detail.length > 160) {
      detail = detail.slice(0, 160);
    }

    result.set(node.id, {
      id: node.id,
      noteTitle,
      summary: node.label,
      detail,
    });
  }

  return result;
}
