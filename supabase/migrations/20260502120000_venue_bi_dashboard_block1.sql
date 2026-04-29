-- BI bloque 1 para dashboard de centro deportivo (single venue con múltiples canchas)

CREATE OR REPLACE VIEW public.bi_venue_reservations_fact AS
SELECT
  r.id,
  c.venue_id AS sports_venue_id,
  r.court_id,
  c.name AS court_name,
  r.starts_at,
  r.ends_at,
  r.status,
  r.payment_status,
  r.booker_user_id,
  r.match_opportunity_id,
  COALESCE(r.paid_amount, r.deposit_amount, r.price_per_hour, 0) AS amount_effective,
  EXTRACT(EPOCH FROM (r.ends_at - r.starts_at)) / 60.0 AS reserved_minutes
FROM public.venue_reservations r
JOIN public.venue_courts c ON c.id = r.court_id;

COMMENT ON VIEW public.bi_venue_reservations_fact IS
  'Hechos de reservas por centro/cancha con monto efectivo normalizado para BI.';

CREATE INDEX IF NOT EXISTS idx_venue_courts_venue_id_id
  ON public.venue_courts (venue_id, id);

CREATE INDEX IF NOT EXISTS idx_venue_reservations_court_starts_ends
  ON public.venue_reservations (court_id, starts_at, ends_at);

CREATE INDEX IF NOT EXISTS idx_venue_reservations_status_starts
  ON public.venue_reservations (status, starts_at);

CREATE INDEX IF NOT EXISTS idx_venue_reservations_payment_status_starts
  ON public.venue_reservations (payment_status, starts_at);

CREATE INDEX IF NOT EXISTS idx_venue_reservations_booker_starts
  ON public.venue_reservations (booker_user_id, starts_at);

CREATE OR REPLACE FUNCTION public.bi_venue_income_timeseries(
  p_venue_id uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_tz text DEFAULT 'America/Santiago'
)
RETURNS TABLE (
  bucket_date date,
  revenue_collected bigint,
  reservations_confirmed int
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH buckets AS (
    SELECT generate_series(
      date_trunc('day', timezone(p_tz, p_from)),
      date_trunc('day', timezone(p_tz, p_to)),
      interval '1 day'
    )::date AS bucket_date
  ),
  scoped AS (
    SELECT
      timezone(p_tz, f.starts_at)::date AS local_date,
      f.amount_effective,
      f.status,
      f.payment_status
    FROM public.bi_venue_reservations_fact f
    WHERE f.sports_venue_id = p_venue_id
      AND f.starts_at < p_to
      AND f.ends_at > p_from
  )
  SELECT
    b.bucket_date,
    COALESCE(
      SUM(
        CASE
          WHEN s.status <> 'cancelled'
           AND s.payment_status IN ('paid', 'deposit_paid')
          THEN s.amount_effective
          ELSE 0
        END
      ),
      0
    )::bigint AS revenue_collected,
    COALESCE(
      COUNT(*) FILTER (WHERE s.status = 'confirmed'),
      0
    )::int AS reservations_confirmed
  FROM buckets b
  LEFT JOIN scoped s ON s.local_date = b.bucket_date
  GROUP BY b.bucket_date
  ORDER BY b.bucket_date;
$$;

CREATE OR REPLACE FUNCTION public.bi_venue_courts_breakdown(
  p_venue_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
RETURNS TABLE (
  court_id uuid,
  court_name text,
  reservations_total int,
  reservations_confirmed int,
  reservations_cancelled int,
  revenue_collected bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    f.court_id,
    MIN(f.court_name)::text AS court_name,
    COUNT(*)::int AS reservations_total,
    COUNT(*) FILTER (WHERE f.status = 'confirmed')::int AS reservations_confirmed,
    COUNT(*) FILTER (WHERE f.status = 'cancelled')::int AS reservations_cancelled,
    COALESCE(
      SUM(
        CASE
          WHEN f.status <> 'cancelled'
           AND f.payment_status IN ('paid', 'deposit_paid')
          THEN f.amount_effective
          ELSE 0
        END
      ),
      0
    )::bigint AS revenue_collected
  FROM public.bi_venue_reservations_fact f
  WHERE f.sports_venue_id = p_venue_id
    AND f.starts_at < p_to
    AND f.ends_at > p_from
  GROUP BY f.court_id
  ORDER BY revenue_collected DESC, reservations_total DESC;
$$;

CREATE OR REPLACE FUNCTION public.bi_venue_kpis_snapshot(
  p_venue_id uuid,
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
  v_duration_seconds numeric := GREATEST(EXTRACT(EPOCH FROM (p_to - p_from)), 1);
  v_prev_from timestamptz := p_from - (p_to - p_from);
  v_prev_to timestamptz := p_from;
  v_venue_exists boolean;
  v_courts_count int := 0;
  v_open_minutes numeric := 0;
  v_open_hours numeric := 0;
  v_booked_minutes_confirmed numeric := 0;
  v_booked_minutes_operational numeric := 0;
  v_reservations_total int := 0;
  v_reservations_confirmed int := 0;
  v_reservations_cancelled int := 0;
  v_revenue bigint := 0;
  v_revenue_prev bigint := 0;
  v_ticket_avg numeric := 0;
  v_cancel_rate numeric := 0;
  v_revpath numeric := 0;
  v_occupancy_confirmed numeric := 0;
  v_occupancy_operational numeric := 0;
  v_recurrent_clients int := 0;
  v_peak_hour int := null;
  v_peak_count int := 0;
  v_valley_hour int := null;
  v_valley_count int := 0;
  v_alerts jsonb := '[]'::jsonb;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM public.sports_venues sv
    WHERE sv.id = p_venue_id
  )
  INTO v_venue_exists;
  IF NOT v_venue_exists THEN
    RETURN jsonb_build_object('ok', false, 'error', 'venue_not_found');
  END IF;

  SELECT COUNT(*)
  INTO v_courts_count
  FROM public.venue_courts vc
  WHERE vc.venue_id = p_venue_id;

  WITH scoped AS (
    SELECT
      f.*,
      EXTRACT(
        EPOCH FROM (
          LEAST(f.ends_at, p_to) - GREATEST(f.starts_at, p_from)
        )
      ) / 60.0 AS overlap_minutes
    FROM public.bi_venue_reservations_fact f
    WHERE f.sports_venue_id = p_venue_id
      AND f.starts_at < p_to
      AND f.ends_at > p_from
  ),
  open_minutes_calc AS (
    SELECT COALESCE(
      SUM(
        GREATEST(
          EXTRACT(
            EPOCH FROM (
              (d.d::date + wh.close_time) -
              (d.d::date + wh.open_time)
            )
          ) / 60.0,
          0
        )
      ),
      0
    ) * GREATEST(v_courts_count, 0) AS minutes_open
    FROM generate_series(
      date_trunc('day', timezone(p_tz, p_from))::date,
      date_trunc('day', timezone(p_tz, p_to))::date,
      interval '1 day'
    ) AS d(d)
    JOIN public.venue_weekly_hours wh
      ON wh.venue_id = p_venue_id
     AND wh.day_of_week = EXTRACT(DOW FROM d.d::date)::int
  ),
  peak_valley AS (
    SELECT
      hour_local,
      COUNT(*) FILTER (WHERE status = 'confirmed')::int AS confirmed_count
    FROM (
      SELECT
        EXTRACT(HOUR FROM timezone(p_tz, starts_at))::int AS hour_local,
        status
      FROM scoped
    ) x
    GROUP BY hour_local
  )
  SELECT
    COALESCE((SELECT minutes_open FROM open_minutes_calc), 0),
    COALESCE(SUM(CASE WHEN status = 'confirmed' THEN overlap_minutes ELSE 0 END), 0),
    COALESCE(
      SUM(
        CASE
          WHEN status IN ('pending', 'confirmed')
          THEN overlap_minutes
          ELSE 0
        END
      ),
      0
    ),
    COUNT(*)::int,
    COUNT(*) FILTER (WHERE status = 'confirmed')::int,
    COUNT(*) FILTER (WHERE status = 'cancelled')::int,
    COALESCE(
      SUM(
        CASE
          WHEN status <> 'cancelled'
           AND payment_status IN ('paid', 'deposit_paid')
          THEN amount_effective
          ELSE 0
        END
      ),
      0
    )::bigint,
    COALESCE(
      (
        SELECT hour_local
        FROM peak_valley
        ORDER BY confirmed_count DESC, hour_local ASC
        LIMIT 1
      ),
      null
    ),
    COALESCE(
      (
        SELECT confirmed_count
        FROM peak_valley
        ORDER BY confirmed_count DESC, hour_local ASC
        LIMIT 1
      ),
      0
    ),
    COALESCE(
      (
        SELECT hour_local
        FROM peak_valley
        ORDER BY confirmed_count ASC, hour_local ASC
        LIMIT 1
      ),
      null
    ),
    COALESCE(
      (
        SELECT confirmed_count
        FROM peak_valley
        ORDER BY confirmed_count ASC, hour_local ASC
        LIMIT 1
      ),
      0
    )
  INTO
    v_open_minutes,
    v_booked_minutes_confirmed,
    v_booked_minutes_operational,
    v_reservations_total,
    v_reservations_confirmed,
    v_reservations_cancelled,
    v_revenue,
    v_peak_hour,
    v_peak_count,
    v_valley_hour,
    v_valley_count
  FROM scoped;

  SELECT COALESCE(
    SUM(
      CASE
        WHEN f.status <> 'cancelled'
         AND f.payment_status IN ('paid', 'deposit_paid')
        THEN f.amount_effective
        ELSE 0
      END
    ),
    0
  )::bigint
  INTO v_revenue_prev
  FROM public.bi_venue_reservations_fact f
  WHERE f.sports_venue_id = p_venue_id
    AND f.starts_at < v_prev_to
    AND f.ends_at > v_prev_from;

  SELECT COUNT(*)::int
  INTO v_recurrent_clients
  FROM (
    SELECT f.booker_user_id
    FROM public.bi_venue_reservations_fact f
    WHERE f.sports_venue_id = p_venue_id
      AND f.starts_at < p_to
      AND f.ends_at > p_from
      AND f.status = 'confirmed'
      AND f.booker_user_id IS NOT NULL
    GROUP BY f.booker_user_id
    HAVING COUNT(*) >= 2
  ) recurring;

  v_open_hours := v_open_minutes / 60.0;
  v_ticket_avg := CASE
    WHEN v_reservations_confirmed > 0
    THEN v_revenue::numeric / v_reservations_confirmed::numeric
    ELSE 0
  END;
  v_cancel_rate := CASE
    WHEN v_reservations_total > 0
    THEN (v_reservations_cancelled::numeric / v_reservations_total::numeric) * 100.0
    ELSE 0
  END;
  v_revpath := CASE
    WHEN v_open_hours > 0
    THEN v_revenue::numeric / v_open_hours
    ELSE 0
  END;
  v_occupancy_confirmed := CASE
    WHEN v_open_minutes > 0
    THEN (v_booked_minutes_confirmed / v_open_minutes) * 100.0
    ELSE 0
  END;
  v_occupancy_operational := CASE
    WHEN v_open_minutes > 0
    THEN (v_booked_minutes_operational / v_open_minutes) * 100.0
    ELSE 0
  END;

  IF v_occupancy_confirmed < 35 THEN
    v_alerts := v_alerts || jsonb_build_object(
      'kind', 'low_occupancy',
      'severity', 'warning',
      'message', 'Ocupación baja en el periodo. Considera promociones o ajustes de precio.'
    );
  END IF;
  IF v_cancel_rate > 20 THEN
    v_alerts := v_alerts || jsonb_build_object(
      'kind', 'high_cancellation',
      'severity', 'warning',
      'message', 'Tasa de cancelación alta. Revisa confirmaciones y recordatorios.'
    );
  END IF;
  IF v_valley_hour IS NOT NULL AND v_peak_hour IS NOT NULL AND v_valley_hour <> v_peak_hour THEN
    v_alerts := v_alerts || jsonb_build_object(
      'kind', 'valley_window',
      'severity', 'info',
      'message',
      format(
        'Baja actividad cerca de %s:00 versus peak %s:00. Evalúa campañas horarias.',
        lpad(v_valley_hour::text, 2, '0'),
        lpad(v_peak_hour::text, 2, '0')
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'meta', jsonb_build_object(
      'venueId', p_venue_id,
      'from', p_from,
      'to', p_to,
      'timezone', p_tz,
      'durationDays', ROUND(v_duration_seconds / 86400.0, 2)
    ),
    'kpis', jsonb_build_object(
      'occupancyConfirmedPct', ROUND(v_occupancy_confirmed, 2),
      'occupancyOperationalPct', ROUND(v_occupancy_operational, 2),
      'deadHours', ROUND(GREATEST(v_open_hours - (v_booked_minutes_confirmed / 60.0), 0), 2),
      'revenueTotal', v_revenue,
      'revPath', ROUND(v_revpath, 2),
      'avgTicket', ROUND(v_ticket_avg, 2),
      'cancellationRatePct', ROUND(v_cancel_rate, 2),
      'reservationsTotal', v_reservations_total,
      'reservationsConfirmed', v_reservations_confirmed,
      'reservationsCancelled', v_reservations_cancelled,
      'peakHour', v_peak_hour,
      'peakCount', v_peak_count,
      'valleyHour', v_valley_hour,
      'valleyCount', v_valley_count,
      'recurringClients', v_recurrent_clients,
      'openHours', ROUND(v_open_hours, 2)
    ),
    'comparative', jsonb_build_object(
      'previousRevenueTotal', v_revenue_prev,
      'revenueDeltaAbs', v_revenue - v_revenue_prev,
      'revenueDeltaPct',
      CASE
        WHEN v_revenue_prev > 0
        THEN ROUND(((v_revenue - v_revenue_prev)::numeric / v_revenue_prev::numeric) * 100.0, 2)
        WHEN v_revenue > 0 THEN 100
        ELSE 0
      END
    ),
    'alerts', v_alerts
  );
END;
$$;

REVOKE ALL ON FUNCTION public.bi_venue_income_timeseries(uuid, timestamptz, timestamptz, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bi_venue_courts_breakdown(uuid, timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bi_venue_kpis_snapshot(uuid, timestamptz, timestamptz, text) FROM PUBLIC;

GRANT SELECT ON public.bi_venue_reservations_fact TO authenticated;
GRANT EXECUTE ON FUNCTION public.bi_venue_income_timeseries(uuid, timestamptz, timestamptz, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bi_venue_courts_breakdown(uuid, timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bi_venue_kpis_snapshot(uuid, timestamptz, timestamptz, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
