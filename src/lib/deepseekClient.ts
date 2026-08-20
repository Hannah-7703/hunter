import type { AiFailureCode } from '@/lib/diagnostics';

const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';

export interface DeepSeekOptions {
  temperature: number;
  max_tokens: number;
  timeout: number;
  response_format?: { type: 'json_object' };
}

export type DeepSeekResult =
  | { content: string }
  | { error: { code: AiFailureCode; upstreamStatus?: number } };

export async function deepseekChat(
  messages: { role: string; content: string }[],
  options: DeepSeekOptions
): Promise<DeepSeekResult> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return { error: { code: 'AI_CONFIG_MISSING' } };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeout);

  try {
    const res = await fetch(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages,
        temperature: options.temperature,
        max_tokens: options.max_tokens,
        ...(options.response_format ? { response_format: options.response_format } : {}),
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      return { error: { code: 'AI_UPSTREAM_HTTP', upstreamStatus: res.status } };
    }

    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };

    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      return { error: { code: 'AI_EMPTY_RESPONSE' } };
    }

    return { content };
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return { error: { code: 'AI_TIMEOUT' } };
    }
    return { error: { code: 'AI_NETWORK' } };
  } finally {
    clearTimeout(timeout);
  }
}
