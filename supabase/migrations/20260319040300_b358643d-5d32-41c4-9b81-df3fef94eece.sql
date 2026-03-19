
-- Tighten the operator queue update WITH CHECK to prevent claiming as another user
DROP POLICY "Operators update own or unclaimed queue items" ON public.page_queue;

CREATE POLICY "Operators update own or unclaimed queue items"
  ON public.page_queue FOR UPDATE TO authenticated
  USING (claimed_by = auth.uid() OR claimed_by IS NULL)
  WITH CHECK (claimed_by = auth.uid() OR claimed_by IS NULL);
