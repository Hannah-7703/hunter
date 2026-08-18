import { SYSTEM_PROMPT_PHASE_B, buildUserPromptPhaseB } from '@/lib/prompts';
import { deepseekChat } from '@/lib/deepseekClient';
import { validateSession } from '@/lib/auth';
import { logError } from '@/lib/logger';
import type { AiFailureCode } from '@/lib/diagnostics';
import type { KeyPoint, DTItem } from '@/shared/types';

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

class AiResponseParseError extends Error {}

function aiFailureMessage(code: AiFailureCode): string {
  if (code === 'AI_TIMEOUT') return '深度分析响应超时，请稍后重试';
  if (code === 'AI_INVALID_RESPONSE') return 'AI 返回结果异常，请稍后重试';
  return '深度分析暂时不可用，请稍后重试';
}

function safeParsePhaseBResponse(raw: string): { question: DTItem[]; breakdown: DTItem[]; expand: DTItem[] } {
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(stripMarkdownCodeBlock(raw));
  } catch {
    throw new AiResponseParseError();
  }

  const now = Date.now();

  function parseDTItems(items: unknown, tab: string): DTItem[] {
    return (Array.isArray(items) ? items : [])
      .filter((it: unknown) => it && typeof it === 'object')
      .map((it: Record<string, unknown>, i: number) => ({
        id: `dt_${now}_${tab}_${i}`,
        summary: truncateSummary((it.summary as string) ?? ''),
        detail: (it.detail as string) ?? '',
      }));
  }

  return {
    question: parseDTItems(json.question ?? [], 'question'),
    breakdown: parseDTItems(json.breakdown ?? [], 'breakdown'),
    expand: parseDTItems(json.expand ?? [], 'expand'),
  };
}

export async function POST(request: Request): Promise<Response> {
  const startMs = Date.now();
  try {
    const ctx = await validateSession(request);
    if (!ctx) {
      return Response.json({ error: '未认证', code: 'SESSION_INVALID' }, { status: 401 });
    }

    const { original, keyPoints } = (await request.json()) as {
      original?: string;
      keyPoints?: KeyPoint[];
    };

    const validKeyPoints = (keyPoints ?? []).filter(kp => kp.summary.trim());

    if (!Array.isArray(keyPoints) || keyPoints.length === 0) {
      return Response.json({ error: 'keyPoints 不能为空', code: 400 }, { status: 400 });
    }

    const messages = [
      { role: 'system', content: SYSTEM_PROMPT_PHASE_B },
      { role: 'user', content: buildUserPromptPhaseB(original ?? '', validKeyPoints) },
    ];

    let result = await deepseekChat(messages, { temperature: 0.6, max_tokens: 4096, timeout: 30000, response_format: { type: 'json_object' } });

    // 重试 1 次
    if ('error' in result) {
      result = await deepseekChat(messages, { temperature: 0.6, max_tokens: 4096, timeout: 30000, response_format: { type: 'json_object' } });
    }

    if ('error' in result) {
      logError('PHASE_B_AI_FAILED', {
        route: '/api/process/phase-b',
        errorType: 'AI_UPSTREAM',
        failureCode: result.error.code,
        upstreamStatus: result.error.upstreamStatus,
        attemptCount: 2,
        inputLength: (original ?? '').length,
        durationMs: Date.now() - startMs,
      });
      return Response.json(
        { error: aiFailureMessage(result.error.code), code: result.error.code },
        { status: 503 }
      );
    }

    const deepThinking = safeParsePhaseBResponse(result.content);

    return Response.json({ deepThinking });
  } catch (error) {
    const failureCode: AiFailureCode = error instanceof AiResponseParseError
      ? 'AI_INVALID_RESPONSE'
      : 'AI_UNKNOWN';
    logError('PHASE_B_FAILED', {
      route: '/api/process/phase-b',
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
