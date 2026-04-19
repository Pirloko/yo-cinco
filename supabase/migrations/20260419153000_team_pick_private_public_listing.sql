-- 6vs6 privado visible en listados como el público; el código de unión solo lo ven
-- organizador, participantes activos y admin (vista cliente).

DROP POLICY IF EXISTS match_opportunities_select_authenticated ON public.match_opportunities;

CREATE POLICY match_opportunities_select_authenticated
  ON public.match_opportunities
  FOR SELECT
  TO authenticated
  USING (
    (
      type IS DISTINCT FROM 'team_pick_private'::public.match_type
    )
    OR (
      type = 'team_pick_private'::public.match_type
      AND (
        status IN ('pending', 'confirmed')
        OR creator_id = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.match_opportunity_participants p
          WHERE p.opportunity_id = match_opportunities.id
            AND p.user_id = auth.uid()
        )
        OR public.is_admin()
      )
    )
  );

DROP POLICY IF EXISTS match_opportunities_select_anon_open_active ON public.match_opportunities;

CREATE POLICY match_opportunities_select_anon_open_active
  ON public.match_opportunities
  FOR SELECT
  TO anon
  USING (
    status IN ('pending', 'confirmed')
    AND (
      type = 'open'::public.match_type
      OR type = 'team_pick_public'::public.match_type
      OR type = 'team_pick_private'::public.match_type
    )
  );

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
  'Lectura de oportunidades para el cliente: join_code solo en team_pick_private si aplica.';

GRANT SELECT ON public.match_opportunities_masked TO anon, authenticated, service_role;

-- La vista usa is_admin(); sin esto una lectura anon fallaría al evaluar la expresión.
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon;

NOTIFY pgrst, 'reload schema';
