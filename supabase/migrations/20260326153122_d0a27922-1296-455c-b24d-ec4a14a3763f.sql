
CREATE OR REPLACE FUNCTION public.validate_finding_flag_status()
RETURNS trigger LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.admin_status NOT IN ('pending', 'ignored', 'fixed', 'prompt_updated') THEN
    RAISE EXCEPTION 'Invalid admin_status: %', NEW.admin_status;
  END IF;
  RETURN NEW;
END;
$$;
