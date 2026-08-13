-- ============================================
-- Hunter mind_nodes 表新增 detail 列
-- 请在 Supabase SQL Editor 中按顺序执行
-- 建议执行前备份 mind_nodes 表
-- ============================================

-- 1. 新增 detail 列
ALTER TABLE mind_nodes ADD COLUMN IF NOT EXISTS detail TEXT;

-- 2. 回填：keyPoints 的 detail
UPDATE mind_nodes mn
SET detail = sub.detail
FROM (
  SELECT mn2.id AS node_id, kp->>'detail' AS detail
  FROM mind_nodes mn2
  JOIN notes n ON n.id = mn2.note_id
  CROSS JOIN LATERAL jsonb_array_elements(n.key_points) kp
  WHERE kp->>'id' = mn2.item_id
) sub
WHERE mn.id = sub.node_id AND mn.detail IS NULL;

-- 3. 回填：deepThinking.question
UPDATE mind_nodes mn
SET detail = sub.detail
FROM (
  SELECT mn2.id AS node_id, dt->>'detail' AS detail
  FROM mind_nodes mn2
  JOIN notes n ON n.id = mn2.note_id
  CROSS JOIN LATERAL jsonb_array_elements(n.deep_thinking->'question') dt
  WHERE dt->>'id' = mn2.item_id
) sub
WHERE mn.id = sub.node_id AND mn.detail IS NULL;

-- 4. 回填：deepThinking.breakdown
UPDATE mind_nodes mn
SET detail = sub.detail
FROM (
  SELECT mn2.id AS node_id, dt->>'detail' AS detail
  FROM mind_nodes mn2
  JOIN notes n ON n.id = mn2.note_id
  CROSS JOIN LATERAL jsonb_array_elements(n.deep_thinking->'breakdown') dt
  WHERE dt->>'id' = mn2.item_id
) sub
WHERE mn.id = sub.node_id AND mn.detail IS NULL;

-- 5. 回填：deepThinking.expand
UPDATE mind_nodes mn
SET detail = sub.detail
FROM (
  SELECT mn2.id AS node_id, dt->>'detail' AS detail
  FROM mind_nodes mn2
  JOIN notes n ON n.id = mn2.note_id
  CROSS JOIN LATERAL jsonb_array_elements(n.deep_thinking->'expand') dt
  WHERE dt->>'id' = mn2.item_id
) sub
WHERE mn.id = sub.node_id AND mn.detail IS NULL;

-- 6. 验证：检查回填覆盖情况
SELECT
  COUNT(*) AS total_nodes,
  COUNT(*) FILTER (WHERE detail IS NOT NULL) AS with_detail,
  COUNT(*) FILTER (WHERE detail IS NULL AND note_id IS NULL) AS orphan_without_detail,
  COUNT(*) FILTER (WHERE detail IS NULL AND note_id IS NOT NULL) AS linked_without_detail
FROM mind_nodes;
