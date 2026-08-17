import { afterEach, describe, expect, it, vi } from 'vitest';

const originalUrl = process.env.SUPABASE_URL;
const originalKey = process.env.SUPABASE_SERVICE_KEY;

afterEach(() => {
  if (originalUrl === undefined) delete process.env.SUPABASE_URL;
  else process.env.SUPABASE_URL = originalUrl;

  if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_KEY;
  else process.env.SUPABASE_SERVICE_KEY = originalKey;

  vi.resetModules();
});

describe('database environment validation', () => {
  it('defers environment validation until a database operation is requested', async () => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_KEY;
    vi.resetModules();

    const { dbListNotes } = await import('../db');

    await expect(
      dbListNotes({ userId: '11111111-1111-4111-8111-111111111111' })
    ).rejects.toThrow('缺少 SUPABASE_URL 或 SUPABASE_SERVICE_KEY 环境变量');
  });
});
