-- 记录用户是否曾成功沉淀过真实观点。
-- 该状态用于控制冷启动示例与首次沉淀引导，不会随节点删除而回退。
ALTER TABLE public.user_preferences
ADD COLUMN IF NOT EXISTS has_ever_added_mind_node boolean NOT NULL DEFAULT false;

-- 为当前仍有脑图节点的既有用户安全补齐状态。
INSERT INTO public.user_preferences (user_id, has_ever_added_mind_node)
SELECT DISTINCT user_id, true
FROM public.mind_nodes
ON CONFLICT (user_id) DO UPDATE
SET has_ever_added_mind_node = true;
