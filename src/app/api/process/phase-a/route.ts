import { SYSTEM_PROMPT_PHASE_A, buildUserPromptPhaseA } from '@/lib/prompts';
import { deepseekChat } from '@/lib/deepseekClient';
import { validateSession } from '@/lib/auth';
import { logError } from '@/lib/logger';
import type { AiFailureCode } from '@/lib/diagnostics';
import type { EmotionInsight, ProcessResponse, KeyPoint } from '@/shared/types';

function stripMarkdownCodeBlock(text: string): string {
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, '');
    cleaned = cleaned.replace(/\n?```\s*$/, '');
  }
  return cleaned.trim();
}

function parseEmotionInsight(value: unknown, id: string): EmotionInsight {
  const empty: EmotionInsight = { id, present: false, valence: 'neutral', summary: '', detail: '' };
  if (!value || typeof value !== 'object') return empty;
  const insight = value as Record<string, unknown>;
  if (!insight.present) return empty;
  const valence = insight.valence;
  const summary = typeof insight.summary === 'string' ? insight.summary.trim() : '';
  const detail = typeof insight.detail === 'string' ? insight.detail.trim() : '';
  if (!summary || !detail || !['positive', 'negative', 'neutral'].includes(String(valence))) return empty;
  return { id, present: true, valence: valence as EmotionInsight['valence'], summary, detail };
}

class AiResponseParseError extends Error {}

function aiFailureMessage(code: AiFailureCode): string {
  if (code === 'AI_TIMEOUT') return 'AI 整理响应超时，请稍后重试';
  if (code === 'AI_INVALID_RESPONSE') return 'AI 返回结果异常，请稍后重试';
  return 'AI 整理暂时不可用，请稍后重试';
}

function safeParsePhaseAResponse(raw: string): ProcessResponse {
  const defaults: ProcessResponse = {
    title: '',
    original: '',
      keyPoints: [],
      hasSubstance: false,
      deepThinking: {
        question: [], breakdown: [], expand: [],
        emotionInsight: { id: '', present: false, valence: 'neutral', summary: '', detail: '' },
      },
  };

  let json: Record<string, unknown>;
  try {
    json = JSON.parse(stripMarkdownCodeBlock(raw));
  } catch {
    throw new AiResponseParseError();
  }

  const hasSubstance = Boolean(json.hasSubstance);
  if (!hasSubstance) return defaults;

  const cleanedOriginal = typeof json.cleanedOriginal === 'string'
    ? json.cleanedOriginal.trim()
    : '';

  const now = Date.now();

  const keyPoints: KeyPoint[] = (Array.isArray(json.keyPoints) ? json.keyPoints : [])
    .filter((kp: unknown) => kp && typeof kp === 'object')
    .map((kp: Record<string, unknown>, i: number) => ({
      id: `kp_${now}_${i}`,
      summary: ((kp.summary as string) ?? '').trim(),
      detail: (kp.detail as string) ?? '',
    }));

  return {
    title: ((json.title as string) ?? '').trim(),
    original: cleanedOriginal,
    keyPoints,
    hasSubstance: true,
    deepThinking: {
      question: [],
      breakdown: [],
      expand: [],
      emotionInsight: parseEmotionInsight(json.emotionInsight, `ei_${now}`),
    },
  };
}

export async function POST(request: Request): Promise<Response> {
  const startMs = Date.now();
  try {
    const ctx = await validateSession(request);
    if (!ctx) {
      return Response.json({ error: '未认证', code: 'SESSION_INVALID' }, { status: 401 });
    }

    const { content, fromVoice = false } = (await request.json()) as {
      content?: string;
      fromVoice?: boolean;
    };

    const text = (content ?? '').trim();

    if (!text) {
      return Response.json({
        title: '',
        original: '',
        keyPoints: [],
        hasSubstance: false,
        deepThinking: { question: [], breakdown: [], expand: [], emotionInsight: { id: '', present: false, valence: 'neutral', summary: '', detail: '' } },
      });
    }

    const cleaned = text.replace(/[\s\p{P}\p{S}]/gu, '');
    if (cleaned.length === 0) {
      return Response.json({
        title: '',
        original: '',
        keyPoints: [],
        hasSubstance: false,
        deepThinking: { question: [], breakdown: [], expand: [], emotionInsight: { id: '', present: false, valence: 'neutral', summary: '', detail: '' } },
      });
    }

    const messages = [
      { role: 'system', content: SYSTEM_PROMPT_PHASE_A },
      { role: 'user', content: buildUserPromptPhaseA(text, fromVoice) },
    ];

    let result = await deepseekChat(messages, { temperature: 0.4, max_tokens: 1536, timeout: 30000, response_format: { type: 'json_object' } });

    // 重试 1 次
    if ('error' in result) {
      result = await deepseekChat(messages, { temperature: 0.4, max_tokens: 1536, timeout: 30000, response_format: { type: 'json_object' } });
    }

    if ('error' in result) {
      logError('PHASE_A_AI_FAILED', {
        route: '/api/process/phase-a',
        errorType: 'AI_UPSTREAM',
        failureCode: result.error.code,
        upstreamStatus: result.error.upstreamStatus,
        attemptCount: 2,
        inputLength: text.length,
        durationMs: Date.now() - startMs,
      });
      return Response.json(
        { error: aiFailureMessage(result.error.code), code: result.error.code },
        { status: 503 }
      );
    }

    const parsed = safeParsePhaseAResponse(result.content);
    parsed.original = parsed.original || text;

    return Response.json(parsed);
  } catch (error) {
    const failureCode: AiFailureCode = error instanceof AiResponseParseError
      ? 'AI_INVALID_RESPONSE'
      : 'AI_UNKNOWN';
    logError('PHASE_A_FAILED', {
      route: '/api/process/phase-a',
      errorType: 'AI_FATAL',
      failureCode,
      durationMs: Date.now() - startMs,
    });
    return Response.json(
      { error: aiFailureMessage(failureCode), code: failureCode },
      { status: 500 }
    );
  }
}
