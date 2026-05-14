-- Reprogramación: opción de vincular un centro del catálogo (`sports_venues`) al guardar.

DROP FUNCTION IF EXISTS public.reschedule_match_opportunity_with_reason(uuid, text, text, timestamptz, text);

CREATE OR REPLACE FUNCTION public.reschedule_match_opportunity_with_reason(
  p_opportunity_id uuid,
  p_new_venue text,
  p_new_location text,
  p_new_date_time timestamptz,
  p_reason text,
  p_sports_venue_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  mo RECORD;
  v_new_venue text := trim(coalesce(p_new_venue, ''));
  v_new_location text := trim(coalesce(p_new_location, ''));
  v_reason text := trim(coalesce(p_reason, ''));
  v_is_sensitive_change boolean := false;
  v_res_booker uuid;
  v_res_status public.venue_reservation_status;
  v_same_venue_text boolean;
  v_sv_city_id uuid;
  v_final_sports_venue_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  IF char_length(v_reason) < 5 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'reason_required');
  END IF;

  IF p_new_date_time IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_datetime');
  END IF;

  SELECT
    id,
    creator_id,
    status,
    type,
    date_time,
    venue,
    location,
    venue_reservation_id,
    sports_venue_id,
    city_id
    INTO mo
  FROM public.match_opportunities
  WHERE id = p_opportunity_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF auth.uid() IS DISTINCT FROM mo.creator_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_organizer');
  END IF;

  IF mo.status IN ('completed', 'cancelled') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_closed');
  END IF;

  IF mo.venue_reservation_id IS NOT NULL THEN
    SELECT booker_user_id, status
      INTO v_res_booker, v_res_status
    FROM public.venue_reservations
    WHERE id = mo.venue_reservation_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'error', 'reservation_not_found');
    END IF;

    IF v_res_booker IS DISTINCT FROM auth.uid() THEN
      RETURN jsonb_build_object('ok', false, 'error', 'not_reservation_booker');
    END IF;

    IF v_res_status IN ('pending', 'confirmed') THEN
      UPDATE public.venue_reservations
      SET
        match_opportunity_id = NULL,
        status = 'cancelled',
        cancelled_at = COALESCE(cancelled_at, now()),
        cancelled_reason = COALESCE(
          NULLIF(TRIM(cancelled_reason), ''),
          'Reprogramación del partido por el organizador'
        )
      WHERE id = mo.venue_reservation_id;
    ELSIF v_res_status = 'cancelled' THEN
      UPDATE public.match_opportunities
      SET
        venue_reservation_id = NULL,
        updated_at = now()
      WHERE id = mo.id;
    ELSE
      RETURN jsonb_build_object('ok', false, 'error', 'reservation_status_unsupported');
    END IF;
  END IF;

  IF now() > mo.date_time - interval '2 hours' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'too_late_reschedule');
  END IF;

  IF p_new_date_time < now() + interval '2 hours' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'new_time_too_soon');
  END IF;

  v_sv_city_id := NULL;
  IF p_sports_venue_id IS NOT NULL THEN
    SELECT trim(name), trim(city), city_id
      INTO v_new_venue, v_new_location, v_sv_city_id
    FROM public.sports_venues
    WHERE id = p_sports_venue_id
      AND NOT is_paused;

    IF NOT FOUND OR char_length(v_new_venue) < 3 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'invalid_sports_venue');
    END IF;

    IF char_length(v_new_location) < 3 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'invalid_location_data');
    END IF;
  ELSE
    IF char_length(v_new_venue) < 3 OR char_length(v_new_location) < 3 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'invalid_location_data');
    END IF;
  END IF;

  v_same_venue_text :=
    lower(trim(coalesce(mo.venue, ''))) = lower(v_new_venue)
    AND lower(trim(coalesce(mo.location, ''))) = lower(v_new_location);

  IF mo.date_time = p_new_date_time AND v_same_venue_text AND (
    p_sports_venue_id IS NULL
    OR mo.sports_venue_id IS NOT DISTINCT FROM p_sports_venue_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_changes');
  END IF;

  v_final_sports_venue_id := CASE
    WHEN p_sports_venue_id IS NOT NULL THEN p_sports_venue_id
    WHEN v_same_venue_text THEN mo.sports_venue_id
    ELSE NULL
  END;

  v_is_sensitive_change :=
    mo.date_time IS DISTINCT FROM p_new_date_time
    OR mo.venue IS DISTINCT FROM v_new_venue
    OR mo.sports_venue_id IS DISTINCT FROM v_final_sports_venue_id;

  INSERT INTO public.match_opportunity_reschedules (
    opportunity_id,
    changed_by,
    old_venue,
    old_location,
    old_date_time,
    new_venue,
    new_location,
    new_date_time,
    reason
  )
  VALUES (
    mo.id,
    auth.uid(),
    mo.venue,
    mo.location,
    mo.date_time,
    v_new_venue,
    v_new_location,
    p_new_date_time,
    v_reason
  );

  UPDATE public.match_opportunities
  SET
    venue = v_new_venue,
    location = v_new_location,
    date_time = p_new_date_time,
    sports_venue_id = v_final_sports_venue_id,
    city_id = CASE
      WHEN p_sports_venue_id IS NOT NULL AND v_sv_city_id IS NOT NULL THEN v_sv_city_id
      ELSE mo.city_id
    END,
    venue_reservation_id = NULL,
    updated_at = now()
  WHERE id = mo.id;

  IF v_is_sensitive_change THEN
    UPDATE public.match_opportunity_participants
    SET status = 'pending'
    WHERE opportunity_id = mo.id
      AND user_id <> mo.creator_id
      AND status = 'confirmed';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'sensitive_change', v_is_sensitive_change
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reschedule_match_opportunity_with_reason(uuid, text, text, timestamptz, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reschedule_match_opportunity_with_reason(uuid, text, text, timestamptz, text, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
