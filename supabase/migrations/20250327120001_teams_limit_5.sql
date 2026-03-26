-- Bloquear creación de equipos si el capitán ya pertenece a 5 equipos.
-- Esto evita crear filas "huérfanas" en public.teams cuando falla el insert a team_members.

CREATE OR REPLACE FUNCTION public.enforce_teams_limit_5_on_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  IF NEW.captain_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM public.team_members tm
  WHERE tm.user_id = NEW.captain_id;

  IF v_count >= 5 THEN
    RAISE EXCEPTION 'team_limit_reached' USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_teams_limit_5 ON public.teams;
CREATE TRIGGER trg_teams_limit_5
  BEFORE INSERT ON public.teams
  FOR EACH ROW EXECUTE PROCEDURE public.enforce_teams_limit_5_on_insert();

REVOKE ALL ON FUNCTION public.enforce_teams_limit_5_on_insert() FROM PUBLIC;
