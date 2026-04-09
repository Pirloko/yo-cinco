-- RPCs para mutaciones críticas de reservas (Fase 4):
-- - confirmar/cancelar por dueño del centro
-- - confirmar por el booker (autoconfirmación)

CREATE OR REPLACE FUNCTION public.confirm_venue_reservation_as_owner(
  p_reservation_id uuid,
  p_mark_paid boolean DEFAULT true,
  p_note text DEFAULT 'Confirmada por centro deportivo'
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_venue_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT c.venue_id INTO v_venue_id
  FROM public.venue_reservations r
  JOIN public.venue_courts c ON c.id = r.court_id
  WHERE r.id = p_reservation_id;

  IF v_venue_id IS NULL THEN
    RAISE EXCEPTION 'reservation_not_found';
  END IF;

  IF NOT public.is_venue_owner(v_venue_id) THEN
    RAISE EXCEPTION 'not_owner' USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE public.venue_reservations
  SET status = 'confirmed',
      payment_status = CASE WHEN p_mark_paid THEN 'paid'::public.venue_payment_status ELSE payment_status END,
      confirmation_source = 'venue_owner',
      confirmed_by_user_id = auth.uid(),
      confirmation_note = COALESCE(NULLIF(TRIM(p_note), ''), 'Confirmada por centro deportivo'),
      confirmed_at = COALESCE(confirmed_at, now())
  WHERE id = p_reservation_id;

  RETURN json_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_venue_reservation_as_owner(uuid, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_venue_reservation_as_owner(uuid, boolean, text) TO authenticated;


CREATE OR REPLACE FUNCTION public.cancel_venue_reservation_as_owner(
  p_reservation_id uuid,
  p_reason text DEFAULT 'Cancelada por el centro deportivo'
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_venue_id uuid;
  v_reason text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT c.venue_id INTO v_venue_id
  FROM public.venue_reservations r
  JOIN public.venue_courts c ON c.id = r.court_id
  WHERE r.id = p_reservation_id;

  IF v_venue_id IS NULL THEN
    RAISE EXCEPTION 'reservation_not_found';
  END IF;

  IF NOT public.is_venue_owner(v_venue_id) THEN
    RAISE EXCEPTION 'not_owner' USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_reason := COALESCE(NULLIF(TRIM(p_reason), ''), 'Cancelada por el centro deportivo');

  UPDATE public.venue_reservations
  SET status = 'cancelled',
      cancelled_reason = v_reason,
      cancelled_at = COALESCE(cancelled_at, now())
  WHERE id = p_reservation_id;

  RETURN json_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_venue_reservation_as_owner(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_venue_reservation_as_owner(uuid, text) TO authenticated;


CREATE OR REPLACE FUNCTION public.confirm_venue_reservation_as_booker(
  p_reservation_id uuid,
  p_note text DEFAULT 'Confirmada por organizador en flujo guiado',
  p_mark_paid boolean DEFAULT false
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booker_id uuid;
  v_note text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT r.booker_user_id INTO v_booker_id
  FROM public.venue_reservations r
  WHERE r.id = p_reservation_id;

  IF v_booker_id IS NULL THEN
    -- Incluye caso reserva no existe o no tiene booker: ambos son no autorizados.
    RAISE EXCEPTION 'not_booker' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_booker_id <> auth.uid() THEN
    RAISE EXCEPTION 'not_booker' USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_note := COALESCE(NULLIF(TRIM(p_note), ''), 'Confirmada por organizador en flujo guiado');

  UPDATE public.venue_reservations
  SET status = 'confirmed',
      payment_status = CASE WHEN p_mark_paid THEN 'paid'::public.venue_payment_status ELSE payment_status END,
      confirmation_source = 'booker_self',
      confirmed_by_user_id = auth.uid(),
      confirmation_note = v_note,
      confirmed_at = COALESCE(confirmed_at, now())
  WHERE id = p_reservation_id
    AND booker_user_id = auth.uid();

  RETURN json_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_venue_reservation_as_booker(uuid, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_venue_reservation_as_booker(uuid, text, boolean) TO authenticated;

