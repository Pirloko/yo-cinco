-- Bloque 2 (cierre): resolver partido privado por código; alineación; expulsión por organizador.

-- ---------------------------------------------------------------------------
-- 1) Vista previa + id para unirse sin haber visto el partido en listados
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_team_pick_private_join_code(p_join_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code text := trim(coalesce(p_join_code, ''));
  mo RECORD;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  IF v_code !~ '^[0-9]{4}$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_code_format');
  END IF;

  SELECT
    id,
    type,
    title,
    venue,
    location,
    date_time,
    level,
    gender,
    status,
    players_needed,
    players_joined
  INTO mo
  FROM public.match_opportunities
  WHERE type = 'team_pick_private'::public.match_type
    AND join_code = v_code
    AND status IN ('pending', 'confirmed')
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF mo.date_time < date_trunc('day', now()) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'past');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'matchId', mo.id,
    'title', mo.title,
    'venue', mo.venue,
    'location', mo.location,
    'dateTime', mo.date_time,
    'level', mo.level::text,
    'gender', mo.gender::text,
    'playersNeeded', mo.players_needed,
    'playersJoined', mo.players_joined
  );
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_team_pick_private_join_code(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_team_pick_private_join_code(text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 2) Cambiar equipo/rol (uno mismo o el organizador sobre cualquiera)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_team_pick_participant_lineup(
  p_opportunity_id uuid,
  p_target_user_id uuid,
  p_pick_team text,
  p_encounter_lineup_role text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  mo RECORD;
  v_team text := upper(trim(coalesce(p_pick_team, '')));
  v_role text := lower(trim(coalesce(p_encounter_lineup_role, '')));
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  IF v_team NOT IN ('A', 'B') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_pick_team');
  END IF;

  IF v_role NOT IN ('gk', 'defensa', 'mediocampista', 'delantero') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_encounter_role');
  END IF;

  SELECT id, type, date_time, status, creator_id
    INTO mo
  FROM public.match_opportunities
  WHERE id = p_opportunity_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF mo.type NOT IN (
    'team_pick_public'::public.match_type,
    'team_pick_private'::public.match_type
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_team_pick');
  END IF;

  IF mo.status IN ('completed', 'cancelled') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_closed');
  END IF;

  IF now() > mo.date_time - interval '2 hours' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'too_late_lineup');
  END IF;

  IF NOT (
    auth.uid() = p_target_user_id
    OR auth.uid() = mo.creator_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  UPDATE public.match_opportunity_participants
  SET
    pick_team = v_team,
    encounter_lineup_role = v_role
  WHERE opportunity_id = p_opportunity_id
    AND user_id = p_target_user_id
    AND status IN ('pending', 'confirmed');

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_participant');
  END IF;

  RETURN jsonb_build_object('ok', true);
EXCEPTION
  WHEN check_violation THEN
    RETURN jsonb_build_object('ok', false, 'error', 'rule', 'message', SQLERRM);
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', 'server', 'message', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.set_team_pick_participant_lineup(
  uuid,
  uuid,
  text,
  text
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.set_team_pick_participant_lineup(
  uuid,
  uuid,
  text,
  text
) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3) Expulsar participante (solo organizador; no al creador)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.organizer_remove_team_pick_participant(
  p_opportunity_id uuid,
  p_target_user_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  mo RECORD;
  v_reason text := trim(coalesce(p_reason, ''));
  v_note text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  IF char_length(v_reason) < 5 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'reason_required');
  END IF;

  SELECT id, type, date_time, status, creator_id
    INTO mo
  FROM public.match_opportunities
  WHERE id = p_opportunity_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF mo.creator_id IS DISTINCT FROM auth.uid() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  IF mo.type NOT IN (
    'team_pick_public'::public.match_type,
    'team_pick_private'::public.match_type
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_team_pick');
  END IF;

  IF mo.status IN ('completed', 'cancelled') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_closed');
  END IF;

  IF now() > mo.date_time - interval '2 hours' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'too_late_remove');
  END IF;

  IF p_target_user_id = mo.creator_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'cannot_remove_creator');
  END IF;

  v_note := 'Organizador: ' || v_reason;

  UPDATE public.match_opportunity_participants
  SET
    status = 'cancelled',
    cancelled_at = now(),
    cancelled_reason = v_note
  WHERE opportunity_id = p_opportunity_id
    AND user_id = p_target_user_id
    AND status IN ('pending', 'confirmed');

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_participant');
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.organizer_remove_team_pick_participant(
  uuid,
  uuid,
  text
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.organizer_remove_team_pick_participant(
  uuid,
  uuid,
  text
) TO authenticated;

NOTIFY pgrst, 'reload schema';
