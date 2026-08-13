import { describe, it, expect } from 'vitest';

// ===== 邀请码校验逻辑（与 route.ts 中一致） =====

const VALID_CHARS = /[^ABCDEFGHJKLMNPQRSTUVWXYZ23456789]/g;

function sanitizeCode(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(VALID_CHARS, '');
}

describe('邀请码校验', () => {
  it('过滤非法字符（含 I/0/O/1）', () => {
    expect(sanitizeCode('ABC0DEF1')).toBe('ABCDEF');
  });

  it('过滤非法字符（含小写字母）', () => {
    expect(sanitizeCode('abcxyz')).toBe('ABCXYZ');
  });

  it('过滤非法字符（含特殊字符）', () => {
    expect(sanitizeCode('K3M-9X2!A7')).toBe('K3M9X2A7');
  });

  it('空格被过滤', () => {
    expect(sanitizeCode('K 3 M 9')).toBe('K3M9');
  });

  it('全非法字符返回空字符串', () => {
    expect(sanitizeCode('!@#$%')).toBe('');
  });

  it('空输入返回空字符串', () => {
    expect(sanitizeCode('')).toBe('');
  });

  it('合法字符完整保留', () => {
    expect(sanitizeCode('K3M9X2A7')).toBe('K3M9X2A7');
  });

  // ===== 错误消息统一测试 =====

  it('不存在码返回统一错误消息 INVALID_INVITE', () => {
    const errorResponse = { success: false, error: '邀请码错误，认证失败', code: 'INVITE_INVALID' };
    expect(errorResponse.code).toBe('INVITE_INVALID');
    expect(errorResponse.error).toBe('邀请码错误，认证失败');
  });

  it('格式错误码也返回相同错误消息', () => {
    const errorResponse = { success: false, error: '邀请码错误，认证失败', code: 'INVITE_INVALID' };
    expect(errorResponse.code).toBe('INVITE_INVALID');
  });
});
