
-- BUG 1 FIX: Instead of RAISE EXCEPTION (which leaves orphaned auth.users rows),
-- create the user but mark is_active = false and skip role assignment.
-- AuthContext will detect inactive users and sign them out with a clear message.
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
  _is_active boolean := true;
BEGIN
  -- For self-signups from non-zuper.co domains, create user but mark inactive
  IF NEW.invited_at IS NULL 
     AND split_part(NEW.email, '@', 2) != 'zuper.co' THEN
    _is_active := false;
  END IF;

  INSERT INTO public.users (id, email, display_name, is_active)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    _is_active
  );

  -- Only assign role for legitimate signups
  IF _is_active THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'operator');
  END IF;

  RETURN NEW;
END;
$$;

-- BUG 2 FIX: Create a separate table for signup rejections (no FK to users)
CREATE TABLE IF NOT EXISTS public.signup_rejections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email_domain text NOT NULL,
  reason text NOT NULL DEFAULT 'Non-zuper.co self-registration attempt',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Allow edge functions (service role) to insert; admins can read
ALTER TABLE public.signup_rejections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read signup_rejections"
  ON public.signup_rejections FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));
