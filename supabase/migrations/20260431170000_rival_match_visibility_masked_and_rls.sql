-- Partidos rival en el feed: solo miembros de equipos ligados al desafío (y creador/admin).
-- La vista match_opportunities_masked usa security_invoker=false; el filtro rival va en la definición.

DROP POLICY IF EXISTS rival_challenges_select_related ON public.rival_challenges;

CREATE POLICY rival_challenges_select_related
  ON public.rival_challenges
  FOR SELECT
  TO authenticated
  USING (
    public.is_admin()
    OR challenger_captain_id = auth.uid()
    OR challenged_captain_id = auth.uid()
    OR accepted_captain_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.team_members tm
      WHERE tm.user_id = auth.uid()
        AND tm.team_id = rival_challenges.challenger_team_id
    )
    OR (
      rival_challenges.challenged_team_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.team_members tm
        WHERE tm.user_id = auth.uid()
          AND tm.team_id = rival_challenges.challenged_team_id
      )
    )
    OR (
      rival_challenges.accepted_team_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.team_members tm
        WHERE tm.user_id = auth.uid()
          AND tm.team_id = rival_challenges.accepted_team_id
      )
    )
    OR (
      mode = 'open'
      AND status = 'pending'
      AND NOT EXISTS (
        SELECT 1
        FROM public.team_members tm
        WHERE tm.user_id = auth.uid()
          AND tm.team_id = rival_challenges.challenger_team_id
      )
      AND EXISTS (
        SELECT 1
        FROM public.teams t
        WHERE t.id IS DISTINCT FROM rival_challenges.challenger_team_id
          AND (
            t.captain_id = auth.uid()
            OR t.vice_captain_id = auth.uid()
          )
      )
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
FROM public.match_opportunities mo
WHERE
  mo.type IS DISTINCT FROM 'rival'::public.match_type
  OR (
    auth.uid() IS NOT NULL
    AND (
      mo.creator_id IS NOT DISTINCT FROM auth.uid()
      OR public.is_admin()
      OR EXISTS (
        SELECT 1
        FROM public.rival_challenges rc
        WHERE rc.opportunity_id = mo.id
          AND (
            EXISTS (
              SELECT 1
              FROM public.team_members tm
              WHERE tm.team_id = rc.challenger_team_id
                AND tm.user_id IS NOT DISTINCT FROM auth.uid()
            )
            OR (
              rc.challenged_team_id IS NOT NULL
              AND EXISTS (
                SELECT 1
                FROM public.team_members tm
                WHERE tm.team_id = rc.challenged_team_id
                  AND tm.user_id IS NOT DISTINCT FROM auth.uid()
              )
            )
            OR (
              rc.accepted_team_id IS NOT NULL
              AND EXISTS (
                SELECT 1
                FROM public.team_members tm
                WHERE tm.team_id = rc.accepted_team_id
                  AND tm.user_id IS NOT DISTINCT FROM auth.uid()
              )
            )
          )
      )
    )
  );

COMMENT ON VIEW public.match_opportunities_masked IS
  'Lectura cliente PostgREST: join_code en team_pick_private solo si aplica; partidos rival solo visibles para miembros de equipos del desafío o creador/admin.';

GRANT SELECT ON public.match_opportunities_masked TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
