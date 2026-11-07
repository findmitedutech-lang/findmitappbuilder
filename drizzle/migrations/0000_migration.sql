CREATE TABLE public.published_apps (
  id uuid PRIMARY KEY,
  name text NOT NULL DEFAULT 'Untitled',
  code text NOT NULL DEFAULT '',
  edit_token text NOT NULL,
  published_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.published_apps TO service_role;
ALTER TABLE public.published_apps ENABLE ROW LEVEL SECURITY;