import type { ProcessRequest, ProcessResponse, DeepThinking, KeyPoint } from '@/shared/types';

async function fetchApi<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers as Record<string, string> || {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
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
