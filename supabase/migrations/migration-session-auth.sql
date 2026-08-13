-- ============================================
-- Hunter 会话认证迁移 SQL
-- 请在 Supabase SQL Editor 中按顺序执行
-- 建议执行前先备份 notes 和 mind_nodes 表
-- ============================================

-- 1. 开启 pgcrypto 扩展（用于 SHA-256 哈希）
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. invite_codes 表新增列
ALTER TABLE invite_codes ADD COLUMN IF NOT EXISTS user_uuid UUID DEFAULT gen_random_uuid();
ALTER TABLE invite_codes ADD COLUMN IF NOT EXISTS code_hash TEXT;
ALTER TABLE invite_codes ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';

-- 3. 计算已有邀请码的哈希值
UPDATE invite_codes SET code_hash = encode(digest(code, 'sha256'), 'hex') WHERE code_hash IS NULL;

-- 4. 回填 notes.user_id：邀请码 → UUID
UPDATE notes
SET user_id = invite_codes.user_uuid::text
FROM invite_codes
WHERE notes.user_id = invite_codes.code;

-- 5. 回填 mind_nodes.user_id：邀请码 → UUID
UPDATE mind_nodes
SET user_id = invite_codes.user_uuid::text
FROM invite_codes
WHERE mind_nodes.user_id = invite_codes.code;

-- 6. invite_codes.user_id 改为 UUID
UPDATE invite_codes SET user_id = user_uuid::text;

-- 6.5. 给 user_uuid 加唯一约束（sessions 外键依赖）
ALTER TABLE invite_codes ADD CONSTRAINT invite_codes_user_uuid_unique UNIQUE (user_uuid);

-- 7. 创建 sessions 表
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash TEXT NOT NULL UNIQUE,
  user_uuid UUID NOT NULL REFERENCES invite_codes(user_uuid),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_user_uuid ON sessions(user_uuid);

-- 8. 验证数据完整性（应返回 0 行）
SELECT user_id FROM notes WHERE user_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' LIMIT 5;
SELECT user_id FROM mind_nodes WHERE user_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' LIMIT 5;

-- 验证 invite_codes 的 user_uuid 已填充
SELECT code_hash, user_uuid, user_id, status FROM invite_codes;
