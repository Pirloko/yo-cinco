-- Ciudad de equipo inmutable tras la creación; conteo público de partidos rival completados.

CREATE OR REPLACE FUNCTION public.prevent_team_city_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.city IS DISTINCT FROM NEW.city OR OLD.city_id IS DISTINCT FROM NEW.city_id THEN
      RAISE EXCEPTION 'La ciudad del equipo no se puede modificar';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS teams_city_immutable ON public.teams;
CREATE TRIGGER teams_city_immutable
  BEFORE UPDATE ON public.teams
  FOR EACH ROW
  EXECUTE PROCEDURE public.prevent_team_city_change();

-- Conteos para carrusel "Descubre equipos" (lectura agregada, sin filtrar por usuario).
CREATE OR REPLACE FUNCTION public.team_completed_rival_counts(p_team_ids uuid[])
RETURNS TABLE (team_id uuid, match_count integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.uid AS team_id,
    COALESCE(
      (
        SELECT COUNT(*)::int
        FROM public.rival_challenges rc
        INNER JOIN public.match_opportunities mo ON mo.id = rc.opportunity_id
        WHERE rc.status = 'accepted'
          AND mo.type = 'rival'
          AND mo.status = 'completed'
          AND (
            rc.challenger_team_id = u.uid
            OR rc.challenged_team_id = u.uid
            OR rc.accepted_team_id = u.uid
          )
      ),
      0
    ) AS match_count
  FROM unnest(p_team_ids) AS u(uid);
$$;

GRANT EXECUTE ON FUNCTION public.team_completed_rival_counts(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.team_completed_rival_counts(uuid[]) TO anon;
