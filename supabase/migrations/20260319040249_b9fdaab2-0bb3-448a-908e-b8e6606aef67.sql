
-- Drop all existing temporary policies
DROP POLICY IF EXISTS "Users can read own profile" ON public.users;
DROP POLICY IF EXISTS "Users can read own role" ON public.user_roles;
DROP POLICY IF EXISTS "Authenticated users can read agents" ON public.agents;
DROP POLICY IF EXISTS "Authenticated users can read pages" ON public.pages;
DROP POLICY IF EXISTS "Authenticated users can insert pages" ON public.pages;
DROP POLICY IF EXISTS "Authenticated users can read agent_runs" ON public.agent_runs;
DROP POLICY IF EXISTS "Authenticated users can read agent_configs" ON public.agent_configs;
DROP POLICY IF EXISTS "Admins can read audit_log" ON public.audit_log;
DROP POLICY IF EXISTS "Authenticated users can read page_queue" ON public.page_queue;
DROP POLICY IF EXISTS "Authenticated users can insert page_queue" ON public.page_queue;

-- =====================
-- users
-- =====================
CREATE POLICY "Authenticated users can read all users"
  ON public.users FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Users can update own profile"
  ON public.users FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY "Admins can update any user"
  ON public.users FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- =====================
-- user_roles
-- =====================
CREATE POLICY "Users can read own role"
  ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins can read all roles"
  ON public.user_roles FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage roles"
  ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- =====================
-- pages
-- =====================
CREATE POLICY "Operators read own pages"
  ON public.pages FOR SELECT TO authenticated
  USING (created_by = auth.uid());

CREATE POLICY "Admins read all pages"
  ON public.pages FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Operators insert own pages"
  ON public.pages FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Admins insert any page"
  ON public.pages FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Operators update own pages"
  ON public.pages FOR UPDATE TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Admins update any page"
  ON public.pages FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- =====================
-- agent_runs
-- =====================
CREATE POLICY "Operators read own runs"
  ON public.agent_runs FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.pages WHERE pages.id = agent_runs.page_id AND pages.created_by = auth.uid()
  ));

CREATE POLICY "Admins read all runs"
  ON public.agent_runs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Operators insert own runs"
  ON public.agent_runs FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.pages WHERE pages.id = agent_runs.page_id AND pages.created_by = auth.uid()
  ));

CREATE POLICY "Admins insert any run"
  ON public.agent_runs FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Operators update own runs"
  ON public.agent_runs FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.pages WHERE pages.id = agent_runs.page_id AND pages.created_by = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.pages WHERE pages.id = agent_runs.page_id AND pages.created_by = auth.uid()
  ));

CREATE POLICY "Admins update any run"
  ON public.agent_runs FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- =====================
-- agents
-- =====================
CREATE POLICY "Authenticated read agents"
  ON public.agents FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins update agents"
  ON public.agents FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- =====================
-- agent_configs
-- =====================
CREATE POLICY "Authenticated read agent_configs"
  ON public.agent_configs FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins manage agent_configs"
  ON public.agent_configs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- =====================
-- audit_log
-- =====================
CREATE POLICY "Authenticated insert audit_log"
  ON public.audit_log FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins read audit_log"
  ON public.audit_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- =====================
-- page_queue
-- =====================
CREATE POLICY "Authenticated read page_queue"
  ON public.page_queue FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Authenticated insert page_queue"
  ON public.page_queue FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Operators update own or unclaimed queue items"
  ON public.page_queue FOR UPDATE TO authenticated
  USING (claimed_by = auth.uid() OR claimed_by IS NULL)
  WITH CHECK (true);

CREATE POLICY "Admins update any queue item"
  ON public.page_queue FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
