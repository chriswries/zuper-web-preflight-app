
-- Enums
CREATE TYPE public.app_role AS ENUM ('admin', 'operator');
CREATE TYPE public.page_status AS ENUM ('pending', 'in_progress', 'passed', 'failed', 'passed_with_warnings', 'archived');
CREATE TYPE public.page_mode AS ENUM ('migration', 'ongoing');
CREATE TYPE public.model_tier AS ENUM ('haiku', 'sonnet');
CREATE TYPE public.confidence_tier AS ENUM ('high', 'medium', 'lower');
CREATE TYPE public.run_status AS ENUM ('not_started', 'skipped', 'queued', 'running', 'passed', 'failed', 'warning', 'error');
CREATE TYPE public.queue_status AS ENUM ('queued', 'claimed', 'promoted', 'skipped');

-- users
CREATE TABLE public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  display_name TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- user_roles
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);

-- has_role function
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- pages
CREATE TABLE public.pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID NOT NULL REFERENCES public.users(id),
  new_url TEXT NOT NULL,
  old_url TEXT,
  slug VARCHAR(200),
  target_keyword TEXT,
  figma_comp_path TEXT,
  mode page_mode NOT NULL DEFAULT 'ongoing',
  status page_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- agents
CREATE TABLE public.agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_number INT NOT NULL UNIQUE CHECK (agent_number BETWEEN 1 AND 15),
  name VARCHAR(200) NOT NULL,
  stage_number INT NOT NULL CHECK (stage_number BETWEEN 1 AND 6),
  description TEXT,
  system_prompt TEXT DEFAULT '',
  model_tier model_tier NOT NULL DEFAULT 'haiku',
  confidence_tier confidence_tier NOT NULL DEFAULT 'high',
  processing_model TEXT,
  requires_browserless BOOLEAN NOT NULL DEFAULT false,
  migration_only BOOLEAN NOT NULL DEFAULT false,
  is_blocking BOOLEAN NOT NULL DEFAULT true,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES public.users(id)
);

-- agent_runs
CREATE TABLE public.agent_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id UUID NOT NULL REFERENCES public.pages(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES public.agents(id),
  run_number INT NOT NULL DEFAULT 1,
  status run_status NOT NULL DEFAULT 'not_started',
  report JSONB,
  summary_stats JSONB,
  error_message TEXT,
  model_used TEXT,
  duration_ms INT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- agent_configs
CREATE TABLE public.agent_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  config_key VARCHAR(100) NOT NULL,
  config_value TEXT NOT NULL DEFAULT '',
  description TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES public.users(id)
);

-- audit_log
CREATE TABLE public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id),
  action_type VARCHAR(50) NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  entity_id UUID,
  before_state JSONB,
  after_state JSONB,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- page_queue
CREATE TABLE public.page_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID NOT NULL REFERENCES public.users(id),
  claimed_by UUID REFERENCES public.users(id),
  batch_name VARCHAR(200),
  new_url TEXT NOT NULL,
  old_url TEXT,
  slug VARCHAR(200),
  target_keyword TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  status queue_status NOT NULL DEFAULT 'queued',
  promoted_page_id UUID REFERENCES public.pages(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_pages_created_by ON public.pages(created_by);
CREATE INDEX idx_pages_status ON public.pages(status);
CREATE INDEX idx_agent_runs_page_id ON public.agent_runs(page_id);
CREATE INDEX idx_agent_runs_agent_id ON public.agent_runs(agent_id);
CREATE INDEX idx_agent_runs_status ON public.agent_runs(status);
CREATE INDEX idx_page_queue_status ON public.page_queue(status);
CREATE INDEX idx_page_queue_claimed_by ON public.page_queue(claimed_by);
CREATE INDEX idx_audit_log_entity ON public.audit_log(entity_type, entity_id);

-- Enable RLS (policies deferred to P4)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.page_queue ENABLE ROW LEVEL SECURITY;
