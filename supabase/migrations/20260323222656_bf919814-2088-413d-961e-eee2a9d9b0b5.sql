
-- System settings key-value table
CREATE TABLE public.system_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES public.users(id)
);

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- Admins can read/write system settings
CREATE POLICY "Admins can manage system_settings"
ON public.system_settings
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Insert default baseline
INSERT INTO public.system_settings (key, value) VALUES ('baseline_minutes_per_page', '60');
