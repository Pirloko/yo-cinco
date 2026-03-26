-- Limitar membresías de equipo por usuario (máx. 5 equipos totales).
-- Aplica a inserts en public.team_members (crear equipo o aceptar invitación/solicitud).

CREATE OR REPLACE FUNCTION public.enforce_team_members_limit_5()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  IF NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM public.team_members tm
  WHERE tm.user_id = NEW.user_id;

  IF v_count >= 5 THEN
    RAISE EXCEPTION 'team_limit_reached' USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_team_members_limit_5 ON public.team_members;
CREATE TRIGGER trg_team_members_limit_5
  BEFORE INSERT ON public.team_members
  FOR EACH ROW EXECUTE PROCEDURE public.enforce_team_members_limit_5();

REVOKE ALL ON FUNCTION public.enforce_team_members_limit_5() FROM PUBLIC;
