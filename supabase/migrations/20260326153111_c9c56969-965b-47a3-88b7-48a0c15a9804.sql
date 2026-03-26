
-- finding_flags table
CREATE TABLE public.finding_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_run_id UUID NOT NULL REFERENCES public.agent_runs(id) ON DELETE CASCADE,
  check_name TEXT NOT NULL,
  check_severity TEXT NOT NULL,
  check_finding TEXT,
  agent_name TEXT NOT NULL,
  agent_number INTEGER NOT NULL,
  page_url TEXT NOT NULL,
  page_slug TEXT,
  flagged_by UUID NOT NULL REFERENCES public.users(id),
  reason TEXT NOT NULL,
  admin_status TEXT NOT NULL DEFAULT 'pending',
  admin_notes TEXT,
  resolved_by UUID REFERENCES public.users(id),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Validation trigger instead of CHECK constraint
CREATE OR REPLACE FUNCTION public.validate_finding_flag_status()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.admin_status NOT IN ('pending', 'ignored', 'fixed', 'prompt_updated') THEN
    RAISE EXCEPTION 'Invalid admin_status: %', NEW.admin_status;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_finding_flag_status
  BEFORE INSERT OR UPDATE ON public.finding_flags
  FOR EACH ROW EXECUTE FUNCTION public.validate_finding_flag_status();

CREATE INDEX idx_finding_flags_status ON public.finding_flags(admin_status);
CREATE INDEX idx_finding_flags_agent ON public.finding_flags(agent_number);

-- RLS
ALTER TABLE public.finding_flags ENABLE ROW LEVEL SECURITY;

-- All authenticated can read
CREATE POLICY "Authenticated read finding_flags"
  ON public.finding_flags FOR SELECT TO authenticated
  USING (true);

-- Insert: operators for own pages, admins for any
CREATE POLICY "Operators insert own page flags"
  ON public.finding_flags FOR INSERT TO authenticated
  WITH CHECK (
    flagged_by = auth.uid() AND (
      EXISTS (
        SELECT 1 FROM public.agent_runs ar
        JOIN public.pages p ON p.id = ar.page_id
        WHERE ar.id = agent_run_id AND p.created_by = auth.uid()
      )
      OR public.has_role(auth.uid(), 'admin')
    )
  );

-- Delete: only own flags
CREATE POLICY "Users delete own flags"
  ON public.finding_flags FOR DELETE TO authenticated
  USING (flagged_by = auth.uid());

-- Update: admins only
CREATE POLICY "Admins update flags"
  ON public.finding_flags FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
