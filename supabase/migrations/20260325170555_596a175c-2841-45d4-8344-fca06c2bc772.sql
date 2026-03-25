
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
BEGIN
  -- Block self-signups from non-zuper.co domains
  -- Admin invites set invited_at, so they pass through
  IF NEW.invited_at IS NULL 
     AND split_part(NEW.email, '@', 2) != 'zuper.co' THEN
    RAISE EXCEPTION 'Self-registration is restricted to @zuper.co email addresses. Contact an admin for an invitation.';
  END IF;

  INSERT INTO public.users (id, email, display_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1))
  );

  -- Default role: operator
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'operator');

  RETURN NEW;
END;
$$;
