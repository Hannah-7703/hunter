// ===== 请求/响应类型 =====

export interface ProcessRequest {
  content: string;
  fromVoice: boolean;
  audioDuration?: string;
}

export interface ProcessResponse {
  title: string;
  original: string;
  keyPoints: KeyPoint[];
  hasSubstance: boolean;
  deepThinking: {
    question: DTItem[];
    breakdown: DTItem[];
    expand: DTItem[];
  };
}

// ===== 数据模型 =====

export interface Note {
  id: string;
  title: string;
  fromVoice: boolean;
  audioDuration?: string;
  original: string;
  keyPoints: KeyPoint[];
  deepThinking: DeepThinking;
  createdAt: string;
  updatedAt: string;
  user_id: string;
}

export interface KeyPoint {
  id: string;                    // AI: kp_${noteId}_${index} / 用户: ukp_${Date.now()}
  summary: string;               // 6-12 字
  detail: string;                // 2-3 句
}

export interface DeepThinking {
  question: DTItem[];
  breakdown: DTItem[];
  expand: DTItem[];
}

export interface DTItem {
  id: string;                    // AI: dt_${noteId}_${tab}_${index} / 用户: udt_${Date.now()}
  summary: string;
  detail: string;
}

export interface MindNode {
  id: string;
  label: string;
  noteId: string | null;
  itemId: string;
  detail: string;
  date: string;
  user_id: string;
}

export interface HistoryItem {
  id: string;
  title: string;
  summary: string;
  time: string;
  addedCount: number;
}

export interface RequestContext {
  userId: string;
}

// ===== 输入类型（store / API 签名用）=====

export type CreateNoteInput = Omit<Note, 'id' | 'createdAt' | 'updatedAt' | 'user_id'>;
export type UpdateNoteInput = Partial<Pick<Note, 'title' | 'original' | 'keyPoints' | 'deepThinking'>>;
export type CreateMindNodeInput = Omit<MindNode, 'id' | 'user_id'>;
