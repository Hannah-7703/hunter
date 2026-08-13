const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';

export interface DeepSeekOptions {
  temperature: number;
  max_tokens: number;
  timeout: number;
  response_format?: { type: 'json_object' };
}

export type DeepSeekResult =
  | { content: string }
  | { error: string };

export async function deepseekChat(
  messages: { role: string; content: string }[],
  options: DeepSeekOptions
): Promise<DeepSeekResult> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return { error: 'DEEPSEEK_API_KEY 未配置' };
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
      return { error: `DeepSeek API 返回状态码 ${res.status}` };
    }

    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };

    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      return { error: 'DeepSeek 返回内容为空' };
    }

    return { content };
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return { error: 'DeepSeek API 请求超时' };
    }
    return { error: `DeepSeek API 请求失败: ${String(err)}` };
  } finally {
    clearTimeout(timeout);
  }
}
