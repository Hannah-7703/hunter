import { createHash } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import type { Note, MindNode, CreateNoteInput, UpdateNoteInput, CreateMindNodeInput, RequestContext } from '@/shared/types';
import type { FocusResult } from '@/lib/mindmapLayout';

// Carries only a database-generated code so route logs remain content-free.
export class DatabaseOperationError extends Error {
  readonly databaseCode: string | null;

  constructor(operation: string, databaseCode: string | null) {
    super(operation);
    this.name = 'DatabaseOperationError';
    this.databaseCode = databaseCode;
  }
}

export interface CreateAnonymousFeedbackInput {
  category: string | null;
  content: string;
  page: string;
}

function createSupabaseClient() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('缺少 SUPABASE_URL 或 SUPABASE_SERVICE_KEY 环境变量');
  }

  return createClient(supabaseUrl, supabaseServiceKey);
}

let supabaseClient: ReturnType<typeof createSupabaseClient> | undefined;

function getSupabaseClient(): ReturnType<typeof createSupabaseClient> {
  if (!supabaseClient) {
    supabaseClient = createSupabaseClient();
  }

  return supabaseClient;
}

export async function dbCreateAnonymousFeedback(input: CreateAnonymousFeedbackInput): Promise<void> {
  const { error } = await getSupabaseClient()
    .from('feedback')
    .insert({
      category: input.category,
      content: input.content,
      page: input.page,
    });

  if (error) {
    throw new DatabaseOperationError('FEEDBACK_CREATE_FAILED', error.code ?? null);
  }
}

// ====== 防御性校验 ======

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function requireUserId(context: RequestContext): void {
  if (!context?.userId || !UUID_RE.test(context.userId)) {
    throw new Error('BUG: user_id 缺失或格式异常，拒绝数据库操作');
  }
}

// ====== snake_case ↔ camelCase 转换 ======

function noteToCamel(data: Record<string, unknown>): Note {
  return {
    id: data.id as string,
    title: data.title as string,
    fromVoice: data.from_voice as boolean,
    audioDuration: (data.audio_duration as string) ?? undefined,
    original: data.original as string,
    keyPoints: (data.key_points as Note['keyPoints']) ?? [],
    deepThinking: (data.deep_thinking as Note['deepThinking']) ?? {
      question: [],
      breakdown: [],
      expand: [],
    },
    createdAt: data.created_at as string,
    updatedAt: data.updated_at as string,
    user_id: data.user_id as string,
  };
}

function noteToSnake(note: Record<string, unknown>): Record<string, unknown> {
  return {
    id: note.id,
    title: note.title,
    from_voice: note.fromVoice,
    audio_duration: note.audioDuration ?? null,
    original: note.original,
    key_points: note.keyPoints,
    deep_thinking: note.deepThinking,
    created_at: note.createdAt,
    updated_at: note.updatedAt,
    user_id: note.user_id,
  };
}

function mindNodeToCamel(data: Record<string, unknown>): MindNode {
  return {
    id: data.id as string,
    label: data.label as string,
    noteId: (data.note_id as string) ?? null,
    itemId: data.item_id as string,
    detail: (data.detail as string) ?? '',
    date: data.date as string,
    user_id: data.user_id as string,
  };
}

function mindNodeToSnake(node: Record<string, unknown>): Record<string, unknown> {
  return {
    id: node.id,
    label: node.label,
    note_id: node.noteId ?? null,
    item_id: node.itemId,
    detail: node.detail,
    date: node.date,
    user_id: node.user_id,
  };
}

// ====== 笔记 CRUD ======

export async function dbCreateNote(
  data: CreateNoteInput & { id: string; createdAt: string; updatedAt: string },
  context: RequestContext
): Promise<Note> {
  requireUserId(context);
  const row = noteToSnake({ ...data as unknown as Record<string, unknown>, user_id: context.userId });
  const { data: created, error } = await getSupabaseClient()
    .from('notes')
    .insert(row)
    .select()
    .single();

  if (error) throw new Error(`数据库创建笔记失败: ${error.message}`);
  return noteToCamel(created as unknown as Record<string, unknown>);
}

export async function dbGetNoteById(id: string, context: RequestContext): Promise<Note | null> {
  requireUserId(context);
  const { data, error } = await getSupabaseClient()
    .from('notes')
    .select()
    .eq('user_id', context.userId)
    .eq('id', id)
    .maybeSingle();

  if (error) throw new Error(`数据库查询笔记失败: ${error.message}`);
  if (!data) return null;
  return noteToCamel(data as unknown as Record<string, unknown>);
}

export async function dbListNotes(context: RequestContext): Promise<Note[]> {
  requireUserId(context);
  const { data, error } = await getSupabaseClient()
    .from('notes')
    .select()
    .eq('user_id', context.userId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(`数据库查询笔记列表失败: ${error.message}`);
  return (data as unknown as Record<string, unknown>[]).map(noteToCamel);
}

export async function dbUpdateNote(
  id: string,
  data: UpdateNoteInput & { updatedAt: string },
  context: RequestContext
): Promise<Note> {
  requireUserId(context);
  const snake: Record<string, unknown> = {};
  if (data.title !== undefined) snake.title = data.title;
  if (data.original !== undefined) snake.original = data.original;
  if (data.keyPoints !== undefined) snake.key_points = data.keyPoints;
  if (data.deepThinking !== undefined) snake.deep_thinking = data.deepThinking;
  snake.updated_at = data.updatedAt;

  const { data: updated, error } = await getSupabaseClient()
    .from('notes')
    .update(snake)
    .eq('user_id', context.userId)
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(`数据库更新笔记失败: ${error.message}`);
  return noteToCamel(updated as unknown as Record<string, unknown>);
}

export async function dbDeleteNoteById(id: string, context: RequestContext): Promise<void> {
  requireUserId(context);

  // 1. 查出笔记当前数据，用于匹配关联节点的最新 summary + detail
  const note = await dbGetNoteById(id, context);

  // 2. 查出关联的 mind_nodes
  const { data: linkedNodes } = await getSupabaseClient()
    .from('mind_nodes')
    .select('id, item_id')
    .eq('user_id', context.userId)
    .eq('note_id', id);

  // 3. 匹配每个关联节点的最新 summary + detail，写回 node 快照
  if (note && linkedNodes && linkedNodes.length > 0) {
    // 构建 itemId → { summary, detail } 映射
    const itemMap = new Map<string, { summary: string; detail: string }>();

    for (const kp of note.keyPoints) {
      itemMap.set(kp.id, { summary: kp.summary, detail: kp.detail });
    }
    for (const tab of ['question', 'breakdown', 'expand'] as const) {
      for (const dt of note.deepThinking[tab]) {
        itemMap.set(dt.id, { summary: dt.summary, detail: dt.detail });
      }
    }

    // 逐个更新匹配到的节点
    for (const node of linkedNodes as unknown as Record<string, unknown>[]) {
      const itemId = node.item_id as string;
      const snapshot = itemMap.get(itemId);
      if (snapshot) {
        await getSupabaseClient()
          .from('mind_nodes')
          .update({ label: snapshot.summary, detail: snapshot.detail })
          .eq('user_id', context.userId)
          .eq('id', node.id as string);
      }
    }
  }

  // 4. 删除笔记
  const { error: noteError } = await getSupabaseClient()
    .from('notes')
    .delete()
    .eq('user_id', context.userId)
    .eq('id', id);
  if (noteError) throw new Error(`数据库删除笔记失败: ${noteError.message}`);

  // 5. 关联节点的 note_id 设为 null
  const { error: mindNodeError } = await getSupabaseClient()
    .from('mind_nodes')
    .update({ note_id: null })
    .eq('user_id', context.userId)
    .eq('note_id', id);

  if (mindNodeError) throw new Error(`数据库更新关联节点失败: ${mindNodeError.message}`);
}

// ====== 脑图节点 CRUD ======

export async function dbCreateMindNode(
  data: CreateMindNodeInput & { id: string },
  context: RequestContext
): Promise<MindNode> {
  requireUserId(context);
  const row = mindNodeToSnake({ ...data as unknown as Record<string, unknown>, user_id: context.userId });
  const { data: created, error } = await getSupabaseClient()
    .from('mind_nodes')
    .insert(row)
    .select()
    .single();

  if (error) throw new Error(`数据库创建节点失败: ${error.message}`);
  return mindNodeToCamel(created as unknown as Record<string, unknown>);
}

export async function dbListMindNodes(context: RequestContext): Promise<MindNode[]> {
  requireUserId(context);
  const { data, error } = await getSupabaseClient()
    .from('mind_nodes')
    .select()
    .eq('user_id', context.userId);

  if (error) throw new Error(`数据库查询节点列表失败: ${error.message}`);
  return (data as unknown as Record<string, unknown>[]).map(mindNodeToCamel);
}

export async function dbDeleteMindNode(id: string, context: RequestContext): Promise<void> {
  requireUserId(context);
  const { error } = await getSupabaseClient()
    .from('mind_nodes')
    .delete()
    .eq('user_id', context.userId)
    .eq('id', id);
  if (error) throw new Error(`数据库删除节点失败: ${error.message}`);
}

// ====== 邀请码 ======

function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

export async function dbVerifyInviteCode(code: string): Promise<string | null> {
  const codeHash = hashCode(code);

  // 先按 hash 查
  const { data: byHash, error: byHashError } = await getSupabaseClient()
    .from('invite_codes')
    .select('user_uuid, status')
    .eq('code_hash', codeHash)
    .maybeSingle();

  if (byHashError) {
    throw new DatabaseOperationError('INVITE_LOOKUP_BY_HASH_FAILED', byHashError.code ?? null);
  }

  if (byHash) {
    if ((byHash as Record<string, unknown>).status !== 'active') return null;
    const uuid = (byHash as Record<string, unknown>).user_uuid as string;
    // 首次使用时标记 used_at
    const { error: markUsedError } = await getSupabaseClient()
      .from('invite_codes')
      .update({ used_at: new Date().toISOString() })
      .eq('code_hash', codeHash)
      .is('used_at', null);
    if (markUsedError) {
      throw new DatabaseOperationError('INVITE_MARK_USED_FAILED', markUsedError.code ?? null);
    }
    return uuid;
  }

  // 向后兼容：未迁移的旧数据（code_hash 为空），直接比对明文
  const { data: byCode, error: byCodeError } = await getSupabaseClient()
    .from('invite_codes')
    .select('user_uuid, status, code_hash')
    .eq('code', code)
    .maybeSingle();

  if (byCodeError) {
    throw new DatabaseOperationError('INVITE_LOOKUP_BY_CODE_FAILED', byCodeError.code ?? null);
  }

  if (byCode && !(byCode as Record<string, unknown>).code_hash && (byCode as Record<string, unknown>).status === 'active') {
    // 补写 hash
    const { error: backfillHashError } = await getSupabaseClient()
      .from('invite_codes')
      .update({ code_hash: codeHash })
      .eq('code', code);
    if (backfillHashError) {
      throw new DatabaseOperationError('INVITE_HASH_BACKFILL_FAILED', backfillHashError.code ?? null);
    }
    return (byCode as Record<string, unknown>).user_uuid as string;
  }

  return null;
}

// ====== 会话管理 ======

export async function dbCreateSession(
  userUuid: string,
  tokenHash: string,
  expiresAt: string
): Promise<void> {
  const { error } = await getSupabaseClient()
    .from('sessions')
    .insert({
      user_uuid: userUuid,
      token_hash: tokenHash,
      expires_at: expiresAt,
    });

  if (error) throw new Error(`创建会话失败: ${error.message}`);
}

export async function dbValidateSession(tokenHash: string): Promise<string | null> {
  const { data, error } = await getSupabaseClient()
    .from('sessions')
    .select('user_uuid, expires_at, revoked')
    .eq('token_hash', tokenHash)
    .maybeSingle();

  if (error || !data) return null;

  const row = data as unknown as Record<string, unknown>;
  if (row.revoked) return null;
  if (new Date(row.expires_at as string) < new Date()) return null;

  return row.user_uuid as string;
}

export async function dbRevokeSession(tokenHash: string): Promise<void> {
  await getSupabaseClient()
    .from('sessions')
    .update({ revoked: true })
    .eq('token_hash', tokenHash);
}

// ====== 用户偏好 ======

export interface UserMindmapPreferences {
  manualRootNodeId: string | null;
  excludedNodeIds: string[];
  focusResult: FocusResult | null;
}

export async function dbGetMindmapPreferences(context: RequestContext): Promise<UserMindmapPreferences> {
  requireUserId(context);
  const { data, error } = await getSupabaseClient()
    .from('user_preferences')
    .select('mindmap_manual_root_node_id, mindmap_excluded_node_ids, mindmap_focus_result')
    .eq('user_id', context.userId)
    .maybeSingle();
  if (error) throw new DatabaseOperationError('MINDMAP_PREFERENCES_GET_FAILED', error.code ?? null);

  return {
    manualRootNodeId: (data?.mindmap_manual_root_node_id as string) ?? null,
    excludedNodeIds: (data?.mindmap_excluded_node_ids as string[]) ?? [],
    focusResult: (data?.mindmap_focus_result as FocusResult) ?? null,
  };
}

export async function dbUpsertMindmapPreferences(
  context: RequestContext,
  prefs: { manualRootNodeId?: string | null; excludedNodeIds?: string[]; focusResult?: FocusResult | null }
): Promise<void> {
  requireUserId(context);
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (prefs.manualRootNodeId !== undefined) {
    update.mindmap_manual_root_node_id = prefs.manualRootNodeId;
  }
  if (prefs.excludedNodeIds !== undefined) {
    update.mindmap_excluded_node_ids = prefs.excludedNodeIds;
  }
  if (prefs.focusResult !== undefined) {
    update.mindmap_focus_result = prefs.focusResult;
  }

  const { error } = await getSupabaseClient()
    .from('user_preferences')
    .upsert({ user_id: context.userId, ...update });
  if (error) throw new DatabaseOperationError('MINDMAP_PREFERENCES_UPSERT_FAILED', error.code ?? null);
}
