CREATE TABLE public.feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text,
  content text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 500),
  page text NOT NULL CHECK (page IN ('capture', 'history', 'mindmap', 'note')),
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'reviewed', 'resolved')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT feedback_category_check CHECK (category IS NULL OR category IN ('功能异常', '体验建议', '想要的功能', '其他'))
);

CREATE INDEX feedback_created_at_idx ON public.feedback (created_at DESC);
CREATE INDEX feedback_status_created_at_idx ON public.feedback (status, created_at DESC);

ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "block_anon" ON public.feedback
  TO anon
  USING (false)
  WITH CHECK (false);

CREATE POLICY "block_authenticated" ON public.feedback
  TO authenticated
  USING (false)
  WITH CHECK (false);
