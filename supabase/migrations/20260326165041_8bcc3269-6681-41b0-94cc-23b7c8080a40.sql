
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _is_active boolean := true;
  _existing_active boolean;
BEGIN
  -- Check if a public.users row already exists (e.g., created by invite-user Edge Function)
  SELECT is_active INTO _existing_active
  FROM public.users
  WHERE id = NEW.id;

  -- If row already exists and is active, skip insert entirely (invite flow already handled it)
  IF _existing_active IS NOT NULL AND _existing_active = true THEN
    RETURN NEW;
  END IF;

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
  )
  ON CONFLICT (id) DO UPDATE SET
    is_active = EXCLUDED.is_active,
    display_name = EXCLUDED.display_name;

  -- Only assign role for legitimate signups
  IF _is_active THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'operator')
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;
