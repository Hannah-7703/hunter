-- ============================================
-- Hunter 用户偏好表 v2 迁移 SQL
-- 新增 mindmap_focus_result 列，持久化完整聚焦结构
-- 请在 Supabase SQL Editor 中执行
-- ============================================

ALTER TABLE user_preferences
ADD COLUMN IF NOT EXISTS mindmap_focus_result JSONB DEFAULT NULL;
