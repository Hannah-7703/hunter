import { DatabaseOperationError, dbCreateAnonymousFeedback } from '@/lib/db';
import { validateSession } from '@/lib/auth';
import { logError, logInfo } from '@/lib/logger';

const CATEGORIES = ['功能异常', '体验建议', '想要的功能', '其他'] as const;
const PAGES = ['capture', 'history', 'mindmap', 'note'] as const;

function isCategory(value: unknown): value is (typeof CATEGORIES)[number] {
  return typeof value === 'string' && CATEGORIES.includes(value as (typeof CATEGORIES)[number]);
}

function isPage(value: unknown): value is (typeof PAGES)[number] {
  return typeof value === 'string' && PAGES.includes(value as (typeof PAGES)[number]);
}

export async function POST(request: Request): Promise<Response> {
  try {
    const ctx = await validateSession(request);
    if (!ctx) {
      return Response.json({ error: '未认证', code: 'SESSION_INVALID' }, { status: 401 });
    }

    const body = await request.json().catch(() => null) as {
      category?: unknown;
      content?: unknown;
      page?: unknown;
    } | null;
    const content = typeof body?.content === 'string' ? body.content.trim() : '';

    if (
      !body ||
      (body.category !== null && body.category !== undefined && !isCategory(body.category)) ||
      !isPage(body.page) ||
      content.length < 1 ||
      content.length > 500
    ) {
      return Response.json({ error: '反馈内容不符合要求', code: 'FEEDBACK_INVALID' }, { status: 400 });
    }

    await dbCreateAnonymousFeedback({
      category: isCategory(body.category) ? body.category : null,
      content,
      page: body.page,
    });

    logInfo('FEEDBACK_SUBMITTED', { route: '/api/feedback' });
    return Response.json({ success: true }, { status: 201 });
  } catch (error) {
    logError('FEEDBACK_SUBMIT_FAILED', {
      route: '/api/feedback',
      errorType: 'UNEXPECTED',
      databaseCode: error instanceof DatabaseOperationError ? error.databaseCode ?? undefined : undefined,
    });
    return Response.json({ error: '提交失败，请稍后重试', code: 'FEEDBACK_UNAVAILABLE' }, { status: 503 });
  }
}
