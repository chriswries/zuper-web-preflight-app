-- Allow operators to delete their own pages
CREATE POLICY "Operators delete own pages"
ON public.pages
FOR DELETE
TO authenticated
USING (created_by = auth.uid());

-- Allow admins to delete any page
CREATE POLICY "Admins delete any page"
ON public.pages
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Allow operators to delete agent_runs for their own pages
CREATE POLICY "Operators delete own runs"
ON public.agent_runs
FOR DELETE
TO authenticated
USING (EXISTS (
  SELECT 1 FROM pages WHERE pages.id = agent_runs.page_id AND pages.created_by = auth.uid()
));

-- Allow admins to delete any agent_run
CREATE POLICY "Admins delete any run"
ON public.agent_runs
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));