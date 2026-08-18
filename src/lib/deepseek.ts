import type { ProcessRequest, ProcessResponse, DeepThinking, KeyPoint } from '@/shared/types';

export class ProcessApiError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super('PROCESS_REQUEST_FAILED');
  }
}

async function fetchApi<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers as Record<string, string> || {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { code?: unknown };
    throw new ProcessApiError(typeof err.code === 'string' ? err.code : 'PROCESS_REQUEST_FAILED', res.status);
  }
  return res.json();
}

export function getProcessErrorMessage(error: unknown): string {
  if (!(error instanceof ProcessApiError)) return 'AI 整理失败，请稍后重试';
  if (error.code === 'SESSION_INVALID') return '登录状态已失效，请重新认证';
  if (error.code === 'AI_TIMEOUT') return 'AI 整理响应超时，请稍后重试';
  if (error.code === 'AI_INVALID_RESPONSE') return 'AI 返回结果异常，请稍后重试';
  return 'AI 整理暂时不可用，请稍后重试';
}

/** @deprecated Phase 3 使用 processPhaseA + processPhaseB 替代 */
export async function process(input: ProcessRequest): Promise<ProcessResponse> {
  const phaseA = await processPhaseA(input);
  if (!phaseA.hasSubstance) return phaseA;
  const deepThinking = await processPhaseB(phaseA.original, phaseA.keyPoints);
  return { ...phaseA, deepThinking };
}

export async function processPhaseA(input: ProcessRequest): Promise<ProcessResponse> {
  return fetchApi<ProcessResponse>('/api/process/phase-a', {
    method: 'POST',
    body: JSON.stringify({ content: input.content, fromVoice: input.fromVoice }),
  });
}

export async function processPhaseB(original: string, keyPoints: KeyPoint[]): Promise<DeepThinking> {
  const data = await fetchApi<{ deepThinking: DeepThinking }>('/api/process/phase-b', {
    method: 'POST',
    body: JSON.stringify({ original, keyPoints }),
  });
  return data.deepThinking;
}
