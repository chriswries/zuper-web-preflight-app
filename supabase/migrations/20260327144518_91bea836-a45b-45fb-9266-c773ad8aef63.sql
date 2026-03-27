
-- pages: Drop operator-only SELECT, add all-authenticated SELECT
DROP POLICY IF EXISTS "Operators read own pages" ON public.pages;
CREATE POLICY "All authenticated read all pages" ON public.pages FOR SELECT TO authenticated USING (true);

-- agent_runs: Drop operator-only policies, add all-authenticated policies
DROP POLICY IF EXISTS "Operators read own runs" ON public.agent_runs;
CREATE POLICY "All authenticated read all runs" ON public.agent_runs FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Operators insert own runs" ON public.agent_runs;
CREATE POLICY "All authenticated insert runs" ON public.agent_runs FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Operators update own runs" ON public.agent_runs;
CREATE POLICY "All authenticated update runs" ON public.agent_runs FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Operators delete own runs" ON public.agent_runs;
CREATE POLICY "All authenticated delete runs" ON public.agent_runs FOR DELETE TO authenticated USING (true);

-- finding_flags: Broaden INSERT to any authenticated user (still enforce flagged_by = auth.uid())
DROP POLICY IF EXISTS "Operators insert own page flags" ON public.finding_flags;
CREATE POLICY "Authenticated insert flags" ON public.finding_flags FOR INSERT TO authenticated WITH CHECK (flagged_by = auth.uid());
