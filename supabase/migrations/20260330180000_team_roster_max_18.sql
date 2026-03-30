-- Máximo 18 jugadores por equipo (plantilla; capitán incluido).

CREATE OR REPLACE FUNCTION public.enforce_team_roster_max_18()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.team_members
  WHERE team_id = NEW.team_id;

  IF v_count >= 18 THEN
    RAISE EXCEPTION 'team_roster_full'
      USING ERRCODE = 'check_violation',
      DETAIL = 'La plantilla del equipo ya tiene el máximo de jugadores (18).';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_team_roster_max_18 ON public.team_members;
CREATE TRIGGER trg_team_roster_max_18
  BEFORE INSERT ON public.team_members
  FOR EACH ROW
  EXECUTE PROCEDURE public.enforce_team_roster_max_18();

REVOKE ALL ON FUNCTION public.enforce_team_roster_max_18() FROM PUBLIC;
