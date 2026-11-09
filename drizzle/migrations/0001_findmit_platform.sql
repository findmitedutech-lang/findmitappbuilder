ALTER TABLE public.published_apps ADD COLUMN slug text UNIQUE;

CREATE TABLE public.builder_projects (
  id uuid PRIMARY KEY,
  workspace_hash text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX builder_projects_ws ON public.builder_projects(workspace_hash);
GRANT ALL ON public.builder_projects TO service_role;
ALTER TABLE public.builder_projects ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.project_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  label text NOT NULL DEFAULT '',
  code text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX project_versions_p ON public.project_versions(project_id, created_at DESC);
GRANT ALL ON public.project_versions TO service_role;
ALTER TABLE public.project_versions ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.app_tenants (
  project_id uuid PRIMARY KEY,
  api_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.app_tenants TO service_role;
ALTER TABLE public.app_tenants ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.app_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id uuid NOT NULL,
  collection text NOT NULL,
  owner_id uuid,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX app_records_ac ON public.app_records(app_id, collection, created_at DESC);
GRANT ALL ON public.app_records TO service_role;
ALTER TABLE public.app_records ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.app_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id uuid NOT NULL,
  email text NOT NULL,
  password_hash text NOT NULL,
  name text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (app_id, email)
);
GRANT ALL ON public.app_users TO service_role;
ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.app_sessions (
  token text PRIMARY KEY,
  app_id uuid NOT NULL,
  user_id uuid NOT NULL,
  expires_at timestamptz NOT NULL
);
GRANT ALL ON public.app_sessions TO service_role;
ALTER TABLE public.app_sessions ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.project_secrets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  name text NOT NULL,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, name)
);
GRANT ALL ON public.project_secrets TO service_role;
ALTER TABLE public.project_secrets ENABLE ROW LEVEL SECURITY;