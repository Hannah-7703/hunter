-- ============================================
-- Hunter 用户偏好表迁移 SQL
-- 请在 Supabase SQL Editor 中按顺序执行
-- ============================================

-- 1. 创建 user_preferences 表
CREATE TABLE IF NOT EXISTS user_preferences (
  user_id TEXT PRIMARY KEY,
  mindmap_manual_root_node_id TEXT,
  mindmap_excluded_node_ids TEXT[] DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. 为已有用户创建空偏好记录（user_uuid 与 sessions 表对齐）
INSERT INTO user_preferences (user_id)
SELECT user_uuid FROM invite_codes
ON CONFLICT (user_id) DO NOTHING;

-- 3. 验证
SELECT * FROM user_preferences;
