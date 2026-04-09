-- Fase 4 (robustez): crear partido + (opcional) reservar cancha en una sola transacción.
-- Objetivo: evitar reservas colgadas o partidos creados sin link cuando hay errores intermedios.

CREATE OR REPLACE FUNCTION public.create_match_opportunity_with_optional_reservation(
  p_type public.match_type,
  p_title text,
  p_description text,
  p_location text,
  p_venue text,
  p_city_id uuid,
  p_date_time timestamptz,
  p_level public.skill_level,
  p_team_name text,
  p_players_needed int,
  p_players_joined int,
  p_players_seek_profile text,
  p_gender public.gender,
  p_status public.match_status,
  p_sports_venue_id uuid,
  p_book_court_slot boolean,
  p_court_slot_minutes int,
  p_private_revuelta_team_id uuid,
  p_creator_is_goalkeeper boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reservation_id uuid;
  v_match_id uuid;
  v_end timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  -- Revuelta privada: organizador debe ser miembro confirmado del equipo.
  IF p_private_revuelta_team_id IS NOT NULL THEN
    IF p_type IS DISTINCT FROM 'open' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'private_revuelta_only_open');
    END IF;
    IF NOT public.is_confirmed_team_member(p_private_revuelta_team_id, auth.uid()) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'private_revuelta_not_member');
    END IF;
  END IF;

  -- Reserva opcional (solo si hay venue y no es rival).
  v_reservation_id := NULL;
  IF p_book_court_slot = true AND p_sports_venue_id IS NOT NULL AND p_type IS DISTINCT FROM 'rival' THEN
    v_end := p_date_time + (GREATEST(15, LEAST(180, COALESCE(p_court_slot_minutes, 60)))::text || ' minutes')::interval;
    BEGIN
      v_reservation_id := public.book_venue_slot(p_sports_venue_id, p_date_time, v_end);
    EXCEPTION
      WHEN OTHERS THEN
        -- Normalizamos error de “sin cancha” a código estable para UI.
        IF SQLERRM ILIKE '%no_court%' THEN
          RETURN jsonb_build_object('ok', false, 'error', 'no_court');
        END IF;
        RETURN jsonb_build_object('ok', false, 'error', 'reservation_failed', 'message', SQLERRM);
    END;
  END IF;

  INSERT INTO public.match_opportunities (
    type,
    title,
    description,
    location,
    venue,
    city_id,
    date_time,
    level,
    creator_id,
    team_name,
    players_needed,
    players_joined,
    players_seek_profile,
    gender,
    status,
    sports_venue_id,
    venue_reservation_id,
    private_revuelta_team_id
  )
  VALUES (
    p_type,
    p_title,
    p_description,
    p_location,
    p_venue,
    p_city_id,
    p_date_time,
    p_level,
    auth.uid(),
    p_team_name,
    p_players_needed,
    COALESCE(p_players_joined, 0),
    CASE
      WHEN p_type = 'players' THEN NULLIF(TRIM(p_players_seek_profile), '')
      ELSE NULL
    END,
    p_gender,
    p_status,
    p_sports_venue_id,
    v_reservation_id,
    p_private_revuelta_team_id
  )
  RETURNING id INTO v_match_id;

  IF v_reservation_id IS NOT NULL THEN
    UPDATE public.venue_reservations
    SET match_opportunity_id = v_match_id
    WHERE id = v_reservation_id;
  END IF;

  -- Revuelta abierta: el organizador entra como participante confirmado.
  IF p_type = 'open' THEN
    INSERT INTO public.match_opportunity_participants (opportunity_id, user_id, status, is_goalkeeper)
    VALUES (v_match_id, auth.uid(), 'confirmed', COALESCE(p_creator_is_goalkeeper, false));
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'matchId', v_match_id,
    'reservationId', v_reservation_id
  );
EXCEPTION
  WHEN OTHERS THEN
    -- Cleanup best-effort (por si atrapamos una excepción tras crear algo).
    IF v_match_id IS NOT NULL THEN
      DELETE FROM public.match_opportunities WHERE id = v_match_id;
    END IF;
    IF v_reservation_id IS NOT NULL THEN
      DELETE FROM public.venue_reservations WHERE id = v_reservation_id;
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', 'server', 'message', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.create_match_opportunity_with_optional_reservation(
  public.match_type,
  text,
  text,
  text,
  text,
  uuid,
  timestamptz,
  public.skill_level,
  text,
  int,
  int,
  text,
  public.gender,
  public.match_status,
  uuid,
  boolean,
  int,
  uuid,
  boolean
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_match_opportunity_with_optional_reservation(
  public.match_type,
  text,
  text,
  text,
  text,
  uuid,
  timestamptz,
  public.skill_level,
  text,
  int,
  int,
  text,
  public.gender,
  public.match_status,
  uuid,
  boolean,
  int,
  uuid,
  boolean
) TO authenticated;

