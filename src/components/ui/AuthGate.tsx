'use client';

import { useState, useEffect, useCallback } from 'react';
import { clearClientCache } from '@/lib/clientDataCache';

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [authenticated, setAuthenticated] = useState(false);
  const [checked, setChecked] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);

  // 启动时通过服务端 cookie 检测认证状态
  useEffect(() => {
    let active = true;

    fetch('/api/auth/me')
      .then(res => res.json())
      .then(data => {
        if (!active) return;
        setAuthenticated(Boolean(data.authenticated));
        setChecked(true);
      })
      .catch(() => {
        if (!active) return;
        setAuthenticated(false);
        setChecked(true);
      });

    return () => { active = false; };
  }, []);

  const handleVerify = useCallback(async () => {
    const trimmed = code.trim();
    if (!trimmed) return;

    setError('');
    setVerifying(true);

    try {
      const res = await fetch('/api/invite/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: trimmed }),
      });
      const data = await res.json();

      if (data.success) {
        clearClientCache();
        setAuthenticated(true);
      } else {
        setError(data.error || '邀请码错误，认证失败');
      }
    } catch {
      setError('网络连接失败，请检查网络后重试');
    } finally {
      setVerifying(false);
    }
  }, [code]);

  const handleExit = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch { /* ignore */ }
    clearClientCache();
    setAuthenticated(false);
    setCode('');
    setError('');
    setShowExitConfirm(false);
  }, []);

  const handleCodeChange = useCallback((value: string) => {
    const filtered = value
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');
    setCode(filtered);
    if (error) setError('');
  }, [error]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && code.trim() && !verifying) {
      handleVerify();
    }
  }, [code, verifying, handleVerify]);

  // 检测完成前不渲染任何内容（避免闪烁）
  if (!checked) return null;

  if (!authenticated) {
    return (
      <main className="capture-page min-h-[100dvh]">
        {/* 虚化的 Capture 页 */}
        <div className="auth-gate-blur" aria-hidden="true">
          <div className="pt-[var(--space-48)] pb-[var(--space-8)] px-[24px]">
            <h1 className="page-title">Aha Hunter</h1>
          </div>
        </div>

        {/* 邀请码弹窗 */}
        <div className="auth-gate-overlay" role="dialog" aria-modal="true" aria-label="邀请码验证">
          <div className="auth-gate-card">
            <h2 className="auth-gate-brand">Hunter</h2>
            <p className="auth-gate-desc">输入邀请码开始使用</p>

            <input
              className="auth-gate-input"
              type="text"
              value={code}
              onChange={e => handleCodeChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="输入邀请码"
              disabled={verifying}
              maxLength={8}
              autoComplete="off"
              autoFocus
            />

            <button
              className="auth-gate-confirm"
              disabled={!code.trim() || verifying}
              onClick={handleVerify}
            >
              {verifying ? (
                <span className="auth-gate-spinner" aria-hidden="true" />
              ) : null}
              {verifying ? '验证中…' : '确认'}
            </button>

            {error && <p className="auth-gate-error" role="alert">{error}</p>}
          </div>

          <p className="auth-gate-disclaimer">
            为了您的数据安全，请勿将邀请码透露给第三方。
          </p>
        </div>

        {/* 退出确认弹窗 */}
        {showExitConfirm && (
          <div className="dialog-overlay" role="dialog" aria-modal="true">
            <div className="dialog-card">
              <h3 className="dialog-title">退出</h3>
              <p className="dialog-desc">退出后需重新输入邀请码</p>
              <div className="dialog-actions">
                <button className="dialog-btn-cancel" onClick={() => setShowExitConfirm(false)}>取消</button>
                <button className="dialog-btn-delete" onClick={handleExit}>退出</button>
              </div>
            </div>
          </div>
        )}
      </main>
    );
  }

  return (
    <>
      {children}
      {!showExitConfirm && (
        <button
          className="auth-gate-exit"
          onClick={() => setShowExitConfirm(true)}
          type="button"
        >
          退出
        </button>
      )}
      {showExitConfirm && (
        <div className="dialog-overlay" role="dialog" aria-modal="true">
          <div className="dialog-card">
            <h3 className="dialog-title">退出</h3>
            <p className="dialog-desc">退出后需重新输入邀请码</p>
            <div className="dialog-actions">
              <button className="dialog-btn-cancel" onClick={() => setShowExitConfirm(false)}>取消</button>
              <button className="dialog-btn-delete" onClick={handleExit}>退出</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
