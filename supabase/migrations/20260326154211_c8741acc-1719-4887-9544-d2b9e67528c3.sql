-- Add page_id column to finding_flags
ALTER TABLE public.finding_flags ADD COLUMN page_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000';

-- Populate page_id from agent_runs for existing rows
UPDATE public.finding_flags ff
SET page_id = ar.page_id
FROM public.agent_runs ar
WHERE ff.agent_run_id = ar.id;

-- Add FK constraint
ALTER TABLE public.finding_flags
  ADD CONSTRAINT finding_flags_page_id_fkey
  FOREIGN KEY (page_id) REFERENCES public.pages(id) ON DELETE CASCADE;

-- Remove the default now that existing rows are populated
ALTER TABLE public.finding_flags ALTER COLUMN page_id DROP DEFAULT;

-- Add unique constraint to prevent duplicate flags
CREATE UNIQUE INDEX idx_finding_flags_unique_per_check ON public.finding_flags(agent_run_id, check_name, flagged_by);