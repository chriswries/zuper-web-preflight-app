
-- 1. Create the pipeline_profile enum
CREATE TYPE public.pipeline_profile AS ENUM ('full', 'blog');

-- 2. Add pipeline_profile to pages
ALTER TABLE public.pages
  ADD COLUMN pipeline_profile pipeline_profile NOT NULL DEFAULT 'full';

-- 3. Add blog_system_prompt and skip_in_blog_mode to agents
ALTER TABLE public.agents
  ADD COLUMN blog_system_prompt text DEFAULT '',
  ADD COLUMN skip_in_blog_mode boolean NOT NULL DEFAULT false;

-- 4. Set skip_in_blog_mode for template-level agents
UPDATE public.agents SET skip_in_blog_mode = true WHERE agent_number IN (5, 7, 9, 10, 11, 12, 13, 15);
UPDATE public.agents SET skip_in_blog_mode = false WHERE agent_number IN (1, 2, 3, 4, 6, 8, 14);

-- 5. Add pipeline_profile to page_queue
ALTER TABLE public.page_queue
  ADD COLUMN pipeline_profile pipeline_profile NOT NULL DEFAULT 'full';
