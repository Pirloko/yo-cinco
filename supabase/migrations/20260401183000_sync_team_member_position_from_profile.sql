-- Sincroniza la posición mostrada en plantilla de equipos con el perfil del jugador.

-- Backfill inicial para corregir datos desfasados ya existentes.
UPDATE public.team_members tm
SET position = p.position
FROM public.profiles p
WHERE p.id = tm.user_id
  AND tm.position IS DISTINCT FROM p.position;

CREATE OR REPLACE FUNCTION public.sync_team_member_position_from_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.position IS DISTINCT FROM OLD.position THEN
    UPDATE public.team_members
    SET position = NEW.position
    WHERE user_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_team_member_position_from_profile ON public.profiles;
CREATE TRIGGER trg_sync_team_member_position_from_profile
  AFTER UPDATE OF position ON public.profiles
  FOR EACH ROW
  EXECUTE PROCEDURE public.sync_team_member_position_from_profile();

