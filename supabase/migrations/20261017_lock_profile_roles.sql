-- Security fix: the "Users can update own profile" policy lets any signed-in user update
-- every column of their own profile, including `role` - so an employee could make
-- themselves an admin. Only admins (or server-side code using the service role) may
-- change a role from now on. Name and other fields stay editable as before.

CREATE OR REPLACE FUNCTION public.prevent_role_self_change()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role
     AND auth.uid() IS NOT NULL -- service role / SQL editor have no auth.uid()
     AND NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Only admins can change roles';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_role_self_change ON profiles;
CREATE TRIGGER prevent_role_self_change
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_role_self_change();
