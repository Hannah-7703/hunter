-- 种子用户阶段的最小行为埋点：只记录行为名称、用户和发生时间，绝不记录笔记内容。
CREATE TABLE IF NOT EXISTS public.activity_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  event_name text NOT NULL CHECK (event_name IN ('mindmap_viewed', 'mindmap_node_opened')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activity_events_user_event_created_at
  ON public.activity_events (user_id, event_name, created_at DESC);

ALTER TABLE public.activity_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'activity_events' AND policyname = 'block_anon'
  ) THEN
    CREATE POLICY block_anon ON public.activity_events
      FOR ALL TO anon USING (false) WITH CHECK (false);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'activity_events' AND policyname = 'block_authenticated'
  ) THEN
    CREATE POLICY block_authenticated ON public.activity_events
      FOR ALL TO authenticated USING (false) WITH CHECK (false);
  END IF;
END $$;

GRANT ALL ON TABLE public.activity_events TO service_role;
