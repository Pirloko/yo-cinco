-- CEO / negocio: snapshots solo para service_role (API admin con clave de servicio).
-- No altera tablas ni RPCs existentes del producto.

CREATE OR REPLACE FUNCTION public.admin_ceo_business_snapshot(
  p_from timestamptz,
  p_to timestamptz,
  p_tz text DEFAULT 'America/Santiago'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := now();
  v_to_eff timestamptz := LEAST(p_to, v_now);
  v_from_7d timestamptz := v_now - interval '7 days';
  -- North star
  v_matches_created int := 0;
  v_matches_completed int := 0;
  v_completion_rate numeric := 0;
  v_avg_players_completed numeric := 0;
  v_avg_hours_to_fill numeric := 0;
  v_fill_samples int := 0;
  -- Activation (cohort: registered in [p_from, v_to_eff))
  v_new_players int := 0;
  v_new_onboarded int := 0;
  v_new_first_match_7d int := 0;
  v_avg_hours_first_match numeric := 0;
  v_first_match_samples int := 0;
  -- Liquidity
  v_matches_fillable int := 0;
  v_matches_filled int := 0;
  v_fill_rate_pct numeric := 0;
  v_slots_needed bigint := 0;
  v_slots_joined bigint := 0;
  v_slots_pct numeric := 0;
  v_matches_cancelled int := 0;
  v_cancel_rate_pct numeric := 0;
  -- Retention (rolling)
  v_active_7d int := 0;
  v_multi_match_users int := 0;
  v_players_with_completed int := 0;
  v_avg_matches_per_player numeric := 0;
  -- Monetization
  v_revenue bigint := 0;
  v_matches_with_reservation int := 0;
  v_rev_per_match numeric := 0;
  v_open_minutes_platform numeric := 0;
  v_booked_confirmed_minutes numeric := 0;
  v_occupancy_pct numeric := 0;
  v_res_total int := 0;
  v_res_cancelled int := 0;
  v_res_cancel_pct numeric := 0;
  -- Friction
  v_pending_revuelta int := 0;
  v_pending_team_join int := 0;
  v_banned int := 0;
  v_suspended int := 0;
  v_players_total int := 0;
  v_unfilled_future int := 0;
BEGIN
  IF p_from IS NULL OR p_to IS NULL OR p_from >= p_to THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_range');
  END IF;

  /* --- Matches created in period --- */
  SELECT COUNT(*)::int
  INTO v_matches_created
  FROM public.match_opportunities mo
  WHERE mo.created_at >= p_from
    AND mo.created_at < v_to_eff;

  SELECT COUNT(*)::int
  INTO v_matches_completed
  FROM public.match_opportunities mo
  WHERE mo.created_at >= p_from
    AND mo.created_at < v_to_eff
    AND mo.status = 'completed'::public.match_status;

  IF v_matches_created > 0 THEN
    v_completion_rate := ROUND(100.0 * v_matches_completed::numeric / v_matches_created::numeric, 2);
  END IF;

  SELECT COALESCE(ROUND(AVG(cnt)::numeric, 2), 0)
  INTO v_avg_players_completed
  FROM (
    SELECT mo.id, COUNT(*)::int AS cnt
    FROM public.match_opportunities mo
    INNER JOIN public.match_opportunity_participants mop
      ON mop.opportunity_id = mo.id
     AND mop.status = 'confirmed'::public.participant_status
    WHERE mo.created_at >= p_from
      AND mo.created_at < v_to_eff
      AND mo.status = 'completed'::public.match_status
    GROUP BY mo.id
  ) s;

  SELECT
    COALESCE(ROUND(AVG(GREATEST(EXTRACT(EPOCH FROM (x.last_join - x.mo_created)) / 3600.0, 0))::numeric, 2), 0),
    COUNT(*)::int
  INTO v_avg_hours_to_fill, v_fill_samples
  FROM (
    SELECT
      mo.id,
      mo.created_at AS mo_created,
      (
        SELECT MAX(mop.created_at)
        FROM public.match_opportunity_participants mop
        WHERE mop.opportunity_id = mo.id
          AND mop.status IN (
            'confirmed'::public.participant_status,
            'pending'::public.participant_status
          )
      ) AS last_join
    FROM public.match_opportunities mo
    WHERE mo.created_at >= p_from
      AND mo.created_at < v_to_eff
      AND COALESCE(mo.players_needed, 0) > 0
      AND mo.players_joined >= mo.players_needed
  ) x
  WHERE x.last_join IS NOT NULL;

  /* --- Activation --- */
  SELECT COUNT(*)::int
  INTO v_new_players
  FROM public.profiles pr
  WHERE pr.account_type = 'player'
    AND pr.created_at >= p_from
    AND pr.created_at < v_to_eff;

  SELECT COUNT(*)::int
  INTO v_new_onboarded
  FROM public.profiles pr
  WHERE pr.account_type = 'player'
    AND pr.created_at >= p_from
    AND pr.created_at < v_to_eff
    AND pr.player_essentials_completed_at IS NOT NULL;

  SELECT COUNT(*)::int
  INTO v_new_first_match_7d
  FROM public.profiles pr
  WHERE pr.account_type = 'player'
    AND pr.created_at >= p_from
    AND pr.created_at < v_to_eff
    AND EXISTS (
      SELECT 1
      FROM public.match_opportunity_participants mop
      WHERE mop.user_id = pr.id
        AND mop.status = 'confirmed'::public.participant_status
        AND mop.created_at <= pr.created_at + interval '7 days'
    );

  SELECT
    COALESCE(ROUND(AVG(GREATEST(EXTRACT(EPOCH FROM (f.first_join - pr.created_at)) / 3600.0, 0))::numeric, 2), 0),
    COUNT(*)::int
  INTO v_avg_hours_first_match, v_first_match_samples
  FROM public.profiles pr
  INNER JOIN LATERAL (
    SELECT MIN(mop.created_at) AS first_join
    FROM public.match_opportunity_participants mop
    WHERE mop.user_id = pr.id
      AND mop.status = 'confirmed'::public.participant_status
  ) f ON true
  WHERE pr.account_type = 'player'
    AND pr.created_at >= p_from
    AND pr.created_at < v_to_eff
    AND f.first_join IS NOT NULL;

  /* --- Liquidity --- */
  SELECT COUNT(*)::int
  INTO v_matches_fillable
  FROM public.match_opportunities mo
  WHERE mo.created_at >= p_from
    AND mo.created_at < v_to_eff
    AND COALESCE(mo.players_needed, 0) > 0;

  SELECT COUNT(*)::int
  INTO v_matches_filled
  FROM public.match_opportunities mo
  WHERE mo.created_at >= p_from
    AND mo.created_at < v_to_eff
    AND COALESCE(mo.players_needed, 0) > 0
    AND mo.players_joined >= mo.players_needed;

  IF v_matches_fillable > 0 THEN
    v_fill_rate_pct := ROUND(100.0 * v_matches_filled::numeric / v_matches_fillable::numeric, 2);
  END IF;

  SELECT
    COALESCE(SUM(GREATEST(mo.players_needed, 0))::bigint, 0),
    COALESCE(SUM(LEAST(GREATEST(mo.players_joined, 0), GREATEST(mo.players_needed, 0)))::bigint, 0)
  INTO v_slots_needed, v_slots_joined
  FROM public.match_opportunities mo
  WHERE mo.created_at >= p_from
    AND mo.created_at < v_to_eff
    AND COALESCE(mo.players_needed, 0) > 0;

  IF v_slots_needed > 0 THEN
    v_slots_pct := ROUND(100.0 * v_slots_joined::numeric / v_slots_needed::numeric, 2);
  END IF;

  SELECT COUNT(*)::int
  INTO v_matches_cancelled
  FROM public.match_opportunities mo
  WHERE mo.created_at >= p_from
    AND mo.created_at < v_to_eff
    AND mo.status = 'cancelled'::public.match_status;

  IF v_matches_created > 0 THEN
    v_cancel_rate_pct := ROUND(100.0 * v_matches_cancelled::numeric / v_matches_created::numeric, 2);
  END IF;

  /* --- Retention (global players) --- */
  SELECT COUNT(*)::int
  INTO v_active_7d
  FROM public.profiles pr
  WHERE pr.account_type = 'player'
    AND pr.mod_banned_at IS NULL
    AND pr.last_seen_at IS NOT NULL
    AND pr.last_seen_at >= v_from_7d;

  WITH completed_parts AS (
    SELECT mop.user_id, COUNT(DISTINCT mop.opportunity_id)::int AS n
    FROM public.match_opportunity_participants mop
    INNER JOIN public.match_opportunities mo ON mo.id = mop.opportunity_id
    WHERE mo.status = 'completed'::public.match_status
      AND mop.status = 'confirmed'::public.participant_status
    GROUP BY mop.user_id
  )
  SELECT
    COUNT(*) FILTER (WHERE n >= 2)::int,
    COUNT(*)::int,
    COALESCE(ROUND(AVG(n)::numeric, 2), 0)
  INTO v_multi_match_users, v_players_with_completed, v_avg_matches_per_player
  FROM completed_parts;

  /* --- Monetization (all venues, overlap window) --- */
  SELECT
    COALESCE(
      SUM(
        CASE
          WHEN f.status <> 'cancelled'::public.venue_reservation_status
           AND f.payment_status IN ('paid'::public.venue_payment_status, 'deposit_paid'::public.venue_payment_status)
          THEN f.amount_effective
          ELSE 0
        END
      ),
      0
    )::bigint,
    COALESCE(
      SUM(
        CASE
          WHEN f.status = 'confirmed'::public.venue_reservation_status
          THEN
            EXTRACT(
              EPOCH FROM (
                LEAST(f.ends_at, v_to_eff) - GREATEST(f.starts_at, p_from)
              )
            ) / 60.0
          ELSE 0
        END
      ),
      0
    ),
    COUNT(DISTINCT f.match_opportunity_id) FILTER (WHERE f.match_opportunity_id IS NOT NULL)::int,
    COUNT(*)::int,
    COUNT(*) FILTER (WHERE f.status = 'cancelled'::public.venue_reservation_status)::int
  INTO v_revenue, v_booked_confirmed_minutes, v_matches_with_reservation, v_res_total, v_res_cancelled
  FROM public.bi_venue_reservations_fact f
  WHERE f.starts_at < v_to_eff
    AND f.ends_at > p_from;

  IF v_matches_with_reservation > 0 THEN
    v_rev_per_match := ROUND(v_revenue::numeric / v_matches_with_reservation::numeric, 2);
  END IF;

  IF v_res_total > 0 THEN
    v_res_cancel_pct := ROUND(100.0 * v_res_cancelled::numeric / v_res_total::numeric, 2);
  END IF;

  WITH days AS (
    SELECT generate_series(
      date_trunc('day', timezone(p_tz, p_from))::date,
      date_trunc('day', timezone(p_tz, v_to_eff))::date,
      interval '1 day'
    ) AS d
  ),
  venue_minutes AS (
    SELECT
      sv.id AS venue_id,
      (SELECT COUNT(*)::numeric FROM public.venue_courts vc WHERE vc.venue_id = sv.id) AS court_n,
      COALESCE(
        (
          SELECT SUM(
            GREATEST(
              EXTRACT(
                EPOCH FROM (
                  (dy.d::date + wh.close_time) - (dy.d::date + wh.open_time)
                )
              ) / 60.0,
              0
            )
          )
          FROM days dy
          INNER JOIN public.venue_weekly_hours wh
            ON wh.venue_id = sv.id
           AND wh.day_of_week = EXTRACT(DOW FROM dy.d::date)::int
        ),
        0
      ) AS open_minutes_per_court
    FROM public.sports_venues sv
  )
  SELECT COALESCE(SUM(court_n * open_minutes_per_court), 0)
  INTO v_open_minutes_platform
  FROM venue_minutes;

  IF v_open_minutes_platform > 0 THEN
    v_occupancy_pct := ROUND(100.0 * v_booked_confirmed_minutes / v_open_minutes_platform, 2);
  END IF;

  /* --- Friction --- */
  SELECT COUNT(*)::int
  INTO v_pending_revuelta
  FROM public.revuelta_external_join_requests r
  WHERE r.status = 'pending';

  SELECT COUNT(*)::int
  INTO v_pending_team_join
  FROM public.team_join_requests t
  WHERE t.status = 'pending'::public.invite_status;

  SELECT COUNT(*)::int
  INTO v_banned
  FROM public.profiles pr
  WHERE pr.account_type = 'player'
    AND pr.mod_banned_at IS NOT NULL;

  SELECT COUNT(*)::int
  INTO v_suspended
  FROM public.profiles pr
  WHERE pr.account_type = 'player'
    AND pr.mod_suspended_until IS NOT NULL
    AND pr.mod_suspended_until > v_now;

  SELECT COUNT(*)::int
  INTO v_players_total
  FROM public.profiles pr
  WHERE pr.account_type = 'player';

  SELECT COUNT(*)::int
  INTO v_unfilled_future
  FROM public.match_opportunities mo
  WHERE mo.created_at >= p_from
    AND mo.created_at < v_to_eff
    AND mo.date_time > v_now
    AND mo.status IN ('pending'::public.match_status, 'confirmed'::public.match_status)
    AND COALESCE(mo.players_needed, 0) > 0
    AND mo.players_joined < mo.players_needed;

  RETURN jsonb_build_object(
    'ok', true,
    'meta', jsonb_build_object(
      'from', p_from,
      'to', v_to_eff,
      'timezone', p_tz
    ),
    'northStar', jsonb_build_object(
      'matchesCompleted', v_matches_completed,
      'matchesCreated', v_matches_created,
      'completionRatePct', v_completion_rate,
      'avgConfirmedPlayersPerCompletedMatch', v_avg_players_completed,
      'avgHoursToFillBucket', CASE WHEN v_fill_samples > 0 THEN v_avg_hours_to_fill ELSE NULL END,
      'fillBucketSampleSize', v_fill_samples
    ),
    'activation', jsonb_build_object(
      'newPlayers', v_new_players,
      'onboardingCompletePct',
        CASE WHEN v_new_players > 0
          THEN ROUND(100.0 * v_new_onboarded::numeric / v_new_players::numeric, 2)
          ELSE 0
        END,
      'firstMatchWithin7DaysPct',
        CASE WHEN v_new_players > 0
          THEN ROUND(100.0 * v_new_first_match_7d::numeric / v_new_players::numeric, 2)
          ELSE 0
        END,
      'avgHoursToFirstMatch',
        CASE WHEN v_first_match_samples > 0 THEN v_avg_hours_first_match ELSE NULL END,
      'firstMatchSampleSize', v_first_match_samples
    ),
    'liquidity', jsonb_build_object(
      'matchesCreated', v_matches_created,
      'matchesFillableWithCap', v_matches_fillable,
      'matchesFilled', v_matches_filled,
      'matchesFilledPct', v_fill_rate_pct,
      'slotsJoined', v_slots_joined,
      'slotsNeeded', v_slots_needed,
      'slotsFilledPct', v_slots_pct,
      'matchesCancelledPct', v_cancel_rate_pct,
      'unfilledUpcomingInPeriod', v_unfilled_future
    ),
    'retention', jsonb_build_object(
      'activePlayers7d', v_active_7d,
      'playersWith2PlusCompletedMatches', v_multi_match_users,
      'playersWithCompletedMatch', v_players_with_completed,
      'avgCompletedMatchesPerParticipatingPlayer', v_avg_matches_per_player
    ),
    'monetization', jsonb_build_object(
      'revenueCollectedClp', v_revenue,
      'linkedMatchesWithReservation', v_matches_with_reservation,
      'revenuePerLinkedMatch', v_rev_per_match,
      'courtOccupancyConfirmedPct', v_occupancy_pct,
      'reservationsInWindow', v_res_total,
      'reservationsCancelledPct', v_res_cancel_pct,
      'openMinutesPlatform', ROUND(v_open_minutes_platform, 2),
      'bookedConfirmedMinutes', ROUND(v_booked_confirmed_minutes, 2)
    ),
    'friction', jsonb_build_object(
      'joinRpcErrorRatePct', NULL,
      'joinRpcErrorNote', 'not_tracked',
      'pendingRevueltaRequests', v_pending_revuelta,
      'pendingTeamJoinRequests', v_pending_team_join,
      'playersBanned', v_banned,
      'playersSuspendedNow', v_suspended,
      'playersTotal', v_players_total,
      'pctPlayersBanned',
        CASE WHEN v_players_total > 0
          THEN ROUND(100.0 * v_banned::numeric / v_players_total::numeric, 2)
          ELSE 0
        END,
      'unfilledFutureMatchesInPeriod', v_unfilled_future
    )
  );
END;
$$;

COMMENT ON FUNCTION public.admin_ceo_business_snapshot IS
  'Snapshot agregado marketplace + monetización para panel admin (service_role).';

CREATE OR REPLACE FUNCTION public.admin_players_business_snapshot(
  p_city_ids uuid[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := now();
  v_7d timestamptz := v_now - interval '7 days';
  v_15d timestamptz := v_now - interval '15 days';
  v_30d timestamptz := v_now - interval '30 days';
  v_total int := 0;
  v_active_7d int := 0;
  v_active_30d int := 0;
  v_onboarded int := 0;
  v_played_one int := 0;
  v_returning int := 0;
  v_avg numeric := 0;
  v_median numeric := 0;
  v_inactive_7 int := 0;
  v_inactive_15 int := 0;
  v_inactive_30 int := 0;
  v_top jsonb := '[]'::jsonb;
  v_cohorts jsonb := '[]'::jsonb;
BEGIN
  SELECT COUNT(*)::int
  INTO v_total
  FROM public.profiles pr
  WHERE pr.account_type = 'player'
    AND pr.mod_banned_at IS NULL
    AND (
      p_city_ids IS NULL
      OR cardinality(p_city_ids) = 0
      OR pr.city_id = ANY (p_city_ids)
    );

  SELECT COUNT(*)::int
  INTO v_active_7d
  FROM public.profiles pr
  WHERE pr.account_type = 'player'
    AND pr.mod_banned_at IS NULL
    AND pr.last_seen_at >= v_7d
    AND (
      p_city_ids IS NULL
      OR cardinality(p_city_ids) = 0
      OR pr.city_id = ANY (p_city_ids)
    );

  SELECT COUNT(*)::int
  INTO v_active_30d
  FROM public.profiles pr
  WHERE pr.account_type = 'player'
    AND pr.mod_banned_at IS NULL
    AND pr.last_seen_at >= v_30d
    AND (
      p_city_ids IS NULL
      OR cardinality(p_city_ids) = 0
      OR pr.city_id = ANY (p_city_ids)
    );

  SELECT COUNT(*)::int
  INTO v_onboarded
  FROM public.profiles pr
  WHERE pr.account_type = 'player'
    AND pr.mod_banned_at IS NULL
    AND pr.player_essentials_completed_at IS NOT NULL
    AND (
      p_city_ids IS NULL
      OR cardinality(p_city_ids) = 0
      OR pr.city_id = ANY (p_city_ids)
    );

  WITH eligible AS (
    SELECT pr.id
    FROM public.profiles pr
    WHERE pr.account_type = 'player'
      AND pr.mod_banned_at IS NULL
      AND (
        p_city_ids IS NULL
        OR cardinality(p_city_ids) = 0
        OR pr.city_id = ANY (p_city_ids)
      )
  ),
  stats AS (
    SELECT
      mop.user_id,
      COUNT(DISTINCT mop.opportunity_id)::int AS n
    FROM public.match_opportunity_participants mop
    INNER JOIN public.match_opportunities mo ON mo.id = mop.opportunity_id
    INNER JOIN eligible e ON e.id = mop.user_id
    WHERE mo.status = 'completed'::public.match_status
      AND mop.status = 'confirmed'::public.participant_status
    GROUP BY mop.user_id
  )
  SELECT
    COUNT(*)::int,
    COUNT(*) FILTER (WHERE n >= 2)::int,
    COALESCE(ROUND(AVG(n)::numeric, 2), 0),
    COALESCE(ROUND(percentile_cont(0.5) WITHIN GROUP (ORDER BY n)::numeric, 2), 0)
  INTO v_played_one, v_returning, v_avg, v_median
  FROM stats;

  SELECT COUNT(*)::int
  INTO v_inactive_7
  FROM public.profiles pr
  WHERE pr.account_type = 'player'
    AND pr.mod_banned_at IS NULL
    AND (pr.last_seen_at IS NULL OR pr.last_seen_at < v_7d)
    AND (
      p_city_ids IS NULL
      OR cardinality(p_city_ids) = 0
      OR pr.city_id = ANY (p_city_ids)
    );

  SELECT COUNT(*)::int
  INTO v_inactive_15
  FROM public.profiles pr
  WHERE pr.account_type = 'player'
    AND pr.mod_banned_at IS NULL
    AND (pr.last_seen_at IS NULL OR pr.last_seen_at < v_15d)
    AND (
      p_city_ids IS NULL
      OR cardinality(p_city_ids) = 0
      OR pr.city_id = ANY (p_city_ids)
    );

  SELECT COUNT(*)::int
  INTO v_inactive_30
  FROM public.profiles pr
  WHERE pr.account_type = 'player'
    AND pr.mod_banned_at IS NULL
    AND (pr.last_seen_at IS NULL OR pr.last_seen_at < v_30d)
    AND (
      p_city_ids IS NULL
      OR cardinality(p_city_ids) = 0
      OR pr.city_id = ANY (p_city_ids)
    );

  WITH eligible AS (
    SELECT pr.id
    FROM public.profiles pr
    WHERE pr.account_type = 'player'
      AND pr.mod_banned_at IS NULL
      AND (
        p_city_ids IS NULL
        OR cardinality(p_city_ids) = 0
        OR pr.city_id = ANY (p_city_ids)
      )
  ),
  stats AS (
    SELECT
      mop.user_id,
      COUNT(DISTINCT mop.opportunity_id)::int AS n
    FROM public.match_opportunity_participants mop
    INNER JOIN public.match_opportunities mo ON mo.id = mop.opportunity_id
    INNER JOIN eligible e ON e.id = mop.user_id
    WHERE mo.status = 'completed'::public.match_status
      AND mop.status = 'confirmed'::public.participant_status
    GROUP BY mop.user_id
  )
  SELECT COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'userId', s.user_id,
          'name', COALESCE(pr.name, ''),
          'completedMatches', s.n
        )
        ORDER BY s.n DESC, pr.name ASC NULLS LAST
      )
      FROM (
        SELECT user_id, n
        FROM stats
        ORDER BY n DESC, user_id ASC
        LIMIT 10
      ) s
      INNER JOIN public.profiles pr ON pr.id = s.user_id
    ),
    '[]'::jsonb
  )
  INTO v_top;

  WITH eligible AS (
    SELECT pr.id, pr.created_at, pr.last_seen_at
    FROM public.profiles pr
    WHERE pr.account_type = 'player'
      AND pr.mod_banned_at IS NULL
      AND (
        p_city_ids IS NULL
        OR cardinality(p_city_ids) = 0
        OR pr.city_id = ANY (p_city_ids)
      )
  ),
  cohort AS (
    SELECT
      date_trunc('month', e.created_at AT TIME ZONE 'UTC')::date AS cohort_month,
      COUNT(*)::int AS registered,
      COUNT(*) FILTER (
        WHERE e.last_seen_at IS NOT NULL
          AND e.last_seen_at >= v_now - interval '30 days'
      )::int AS active_last_30d
    FROM eligible e
    WHERE e.created_at >= v_now - interval '6 months'
    GROUP BY 1
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'month', to_char(cohort_month, 'YYYY-MM'),
        'registered', registered,
        'activeLast30d', active_last_30d
      )
      ORDER BY cohort_month DESC
    ),
    '[]'::jsonb
  )
  INTO v_cohorts
  FROM cohort;

  RETURN jsonb_build_object(
    'ok', true,
    'activity', jsonb_build_object(
      'activePlayers7d', v_active_7d,
      'activePlayers30d', v_active_30d,
      'eligiblePlayers', v_total,
      'pctActive7dOfEligible',
        CASE WHEN v_total > 0 THEN ROUND(100.0 * v_active_7d::numeric / v_total::numeric, 2) ELSE 0 END,
      'pctActive30dOfEligible',
        CASE WHEN v_total > 0 THEN ROUND(100.0 * v_active_30d::numeric / v_total::numeric, 2) ELSE 0 END
    ),
    'quality', jsonb_build_object(
      'pctOnboardingComplete',
        CASE WHEN v_total > 0 THEN ROUND(100.0 * v_onboarded::numeric / v_total::numeric, 2) ELSE 0 END,
      'pctPlayedAtLeastOneCompleted',
        CASE WHEN v_total > 0 THEN ROUND(100.0 * v_played_one::numeric / v_total::numeric, 2) ELSE 0 END,
      'pctReturningAmongPlayers',
        CASE WHEN v_played_one > 0 THEN ROUND(100.0 * v_returning::numeric / v_played_one::numeric, 2) ELSE 0 END,
      'playersWithOneOrMoreCompleted', v_played_one,
      'playersWithTwoOrMoreCompleted', v_returning
    ),
    'engagement', jsonb_build_object(
      'avgCompletedMatchesPerPlayerWithPlay', v_avg,
      'medianCompletedMatchesPerPlayerWithPlay', v_median,
      'topActivePlayers', v_top
    ),
    'churn', jsonb_build_object(
      'inactive7d', v_inactive_7,
      'inactive15d', v_inactive_15,
      'inactive30d', v_inactive_30,
      'pctInactive7d',
        CASE WHEN v_total > 0 THEN ROUND(100.0 * v_inactive_7::numeric / v_total::numeric, 2) ELSE 0 END
    ),
    'cohorts', v_cohorts
  );
END;
$$;

COMMENT ON FUNCTION public.admin_players_business_snapshot IS
  'Métricas jugadores para admin; filtro opcional por city_id (service_role).';

REVOKE ALL ON FUNCTION public.admin_ceo_business_snapshot(timestamptz, timestamptz, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_players_business_snapshot(uuid[]) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.admin_ceo_business_snapshot(timestamptz, timestamptz, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_players_business_snapshot(uuid[]) TO service_role;
