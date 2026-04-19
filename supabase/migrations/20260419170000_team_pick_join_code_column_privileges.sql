-- Cierra la filtración del código por SELECT directo a match_opportunities:
-- - Vista match_opportunities_masked con privilegios del propietario (security_invoker=false)
--   así el CASE puede leer mo.join_code sin conceder esa columna a anon/authenticated.
-- - REVOKE SELECT(join_code) en la tabla para anon/authenticated (las lecturas REST van por la vista).

DROP VIEW IF EXISTS public.match_opportunities_masked;

CREATE VIEW public.match_opportunities_masked
WITH (security_invoker = false)
AS
SELECT
  mo.id,
  mo.type,
  mo.title,
  mo.description,
  mo.location,
  mo.venue,
  mo.city_id,
  mo.date_time,
  mo.level,
  mo.creator_id,
  mo.team_name,
  mo.players_needed,
  mo.players_joined,
  mo.players_seek_profile,
  mo.gender,
  mo.status,
  mo.created_at,
  mo.finalized_at,
  mo.rival_result,
  mo.casual_completed,
  mo.suspended_at,
  mo.suspended_reason,
  mo.revuelta_lineup,
  mo.revuelta_result,
  mo.rival_captain_vote_challenger,
  mo.rival_captain_vote_accepted,
  mo.rival_outcome_disputed,
  mo.match_stats_applied_at,
  mo.sports_venue_id,
  mo.venue_reservation_id,
  mo.private_revuelta_team_id,
  CASE
    WHEN mo.type IS DISTINCT FROM 'team_pick_private'::public.match_type THEN mo.join_code
    WHEN mo.creator_id IS NOT DISTINCT FROM auth.uid() THEN mo.join_code
    WHEN EXISTS (
      SELECT 1
      FROM public.match_opportunity_participants p
      WHERE p.opportunity_id = mo.id
        AND p.user_id IS NOT DISTINCT FROM auth.uid()
        AND p.status IN ('pending', 'confirmed')
    ) THEN mo.join_code
    WHEN public.is_admin() THEN mo.join_code
    ELSE NULL
  END AS join_code,
  mo.team_pick_color_a,
  mo.team_pick_color_b
FROM public.match_opportunities mo;

COMMENT ON VIEW public.match_opportunities_masked IS
  'Lectura cliente PostgREST: join_code en team_pick_private solo si aplica; invocación con privilegios del dueño de la vista sobre la tabla base.';

GRANT SELECT ON public.match_opportunities_masked TO anon, authenticated, service_role;

-- Sin acceso directo al código en la tabla para roles del cliente (PostgREST).
REVOKE SELECT (join_code) ON public.match_opportunities FROM PUBLIC;
REVOKE SELECT (join_code) ON public.match_opportunities FROM anon;
REVOKE SELECT (join_code) ON public.match_opportunities FROM authenticated;

-- Scripts servidor / panel con service_role pueden seguir leyendo la columna en la tabla.
GRANT SELECT (join_code) ON public.match_opportunities TO service_role;

NOTIFY pgrst, 'reload schema';
