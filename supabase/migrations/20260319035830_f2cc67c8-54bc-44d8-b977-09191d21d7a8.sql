
-- Temporary permissive policies so auth flow works (P4 will replace these)
-- Users can read their own profile
CREATE POLICY "Users can read own profile" ON public.users
  FOR SELECT TO authenticated
  USING (id = auth.uid());

-- Users can read their own role
CREATE POLICY "Users can read own role" ON public.user_roles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Agents table is readable by all authenticated users
CREATE POLICY "Authenticated users can read agents" ON public.agents
  FOR SELECT TO authenticated
  USING (true);

-- Pages readable by authenticated users (will be tightened in P4)
CREATE POLICY "Authenticated users can read pages" ON public.pages
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert pages" ON public.pages
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

-- Agent runs readable by authenticated users
CREATE POLICY "Authenticated users can read agent_runs" ON public.agent_runs
  FOR SELECT TO authenticated
  USING (true);

-- Agent configs readable by authenticated users
CREATE POLICY "Authenticated users can read agent_configs" ON public.agent_configs
  FOR SELECT TO authenticated
  USING (true);

-- Audit log readable by admins only
CREATE POLICY "Admins can read audit_log" ON public.audit_log
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Page queue readable by all authenticated users
CREATE POLICY "Authenticated users can read page_queue" ON public.page_queue
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert page_queue" ON public.page_queue
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());
