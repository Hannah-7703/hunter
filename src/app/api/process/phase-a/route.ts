import { SYSTEM_PROMPT_PHASE_A, buildUserPromptPhaseA } from '@/lib/prompts';
import { deepseekChat } from '@/lib/deepseekClient';
import { validateSession } from '@/lib/auth';
import { logError } from '@/lib/logger';
import type { ProcessResponse, KeyPoint } from '@/shared/types';

function stripMarkdownCodeBlock(text: string): string {
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, '');
    cleaned = cleaned.replace(/\n?```\s*$/, '');
  }
  return cleaned.trim();
}

function truncateSummary(text: string): string {
  return text.length > 24 ? text.slice(0, 24) + '…' : text;
}

function truncateTitle(text: string): string {
  return text.length > 20 ? text.slice(0, 20) : text;
}

function safeParsePhaseAResponse(raw: string): ProcessResponse {
  const defaults: ProcessResponse = {
    title: '',
    original: '',
    keyPoints: [],
    hasSubstance: false,
    deepThinking: { question: [], breakdown: [], expand: [] },
  };

  let json: Record<string, unknown>;
  try {
    json = JSON.parse(stripMarkdownCodeBlock(raw));
  } catch {
    throw new Error('AI 返回的 JSON 解析失败');
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
      summary: truncateSummary((kp.summary as string) ?? ''),
      detail: (kp.detail as string) ?? '',
    }));

  return {
    title: truncateTitle((json.title as string) ?? ''),
    original: cleanedOriginal,
    keyPoints,
    hasSubstance: true,
    deepThinking: { question: [], breakdown: [], expand: [] },
  };
}

export async function POST(request: Request): Promise<Response> {
  const startMs = Date.now();
  try {
    const ctx = await validateSession(request);
    if (!ctx) {
      return Response.json({ error: '未认证', code: 401 }, { status: 401 });
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
        deepThinking: { question: [], breakdown: [], expand: [] },
      });
    }

    const cleaned = text.replace(/[\s\p{P}\p{S}]/gu, '');
    if (cleaned.length === 0) {
      return Response.json({
        title: '',
        original: '',
        keyPoints: [],
        hasSubstance: false,
        deepThinking: { question: [], breakdown: [], expand: [] },
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
        durationMs: Date.now() - startMs,
      });
      return Response.json(
        { error: 'AI 整理失败，请稍后重试', code: 500 },
        { status: 500 }
      );
    }

    const parsed = safeParsePhaseAResponse(result.content);
    parsed.original = parsed.original || text;

    return Response.json(parsed);
  } catch {
    logError('PHASE_A_FAILED', {
      route: '/api/process/phase-a',
      errorType: 'AI_FATAL',
      durationMs: Date.now() - startMs,
    });
    return Response.json(
      { error: 'AI 整理失败，请稍后重试', code: 500 },
      { status: 500 }
    );
  }
}
