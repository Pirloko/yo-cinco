-- Fase 4 (robustez): rival challenges vía RPC (operaciones atómicas).

CREATE OR REPLACE FUNCTION public.create_rival_challenge(
  p_mode public.rival_challenge_mode,
  p_challenger_team_id uuid,
  p_challenged_team_id uuid,
  p_venue text,
  p_location text,
  p_city_id uuid,
  p_date_time timestamptz,
  p_level public.skill_level,
  p_title text,
  p_description text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_gender public.gender;
  v_team_name text;
  v_challenged_captain_id uuid;
  v_match_id uuid;
  v_challenge_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  -- Challenger debe ser staff (capitán o vice).
  IF NOT public.is_team_staff_captain(p_challenger_team_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_team_staff');
  END IF;

  SELECT t.gender, t.name INTO v_gender, v_team_name
  FROM public.teams t
  WHERE t.id = p_challenger_team_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'team_not_found');
  END IF;

  IF p_mode = 'direct'::public.rival_challenge_mode THEN
    IF p_challenged_team_id IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'missing_challenged_team');
    END IF;
    SELECT t.captain_id INTO v_challenged_captain_id
    FROM public.teams t
    WHERE t.id = p_challenged_team_id
      AND t.gender = v_gender;
    IF NOT FOUND OR v_challenged_captain_id IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'challenged_team_invalid');
    END IF;
  ELSE
    -- open: no challenged team.
    v_challenged_captain_id := NULL;
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
    gender,
    status
  )
  VALUES (
    'rival',
    p_title,
    p_description,
    p_location,
    p_venue,
    p_city_id,
    p_date_time,
    p_level,
    auth.uid(),
    v_team_name,
    v_gender,
    'pending'
  )
  RETURNING id INTO v_match_id;

  INSERT INTO public.rival_challenges (
    opportunity_id,
    challenger_team_id,
    challenger_captain_id,
    challenged_team_id,
    challenged_captain_id,
    mode,
    status
  )
  VALUES (
    v_match_id,
    p_challenger_team_id,
    auth.uid(),
    CASE WHEN p_mode = 'direct' THEN p_challenged_team_id ELSE NULL END,
    CASE WHEN p_mode = 'direct' THEN v_challenged_captain_id ELSE NULL END,
    p_mode,
    'pending'
  )
  RETURNING id INTO v_challenge_id;

  RETURN jsonb_build_object('ok', true, 'opportunityId', v_match_id, 'challengeId', v_challenge_id);
EXCEPTION
  WHEN check_violation THEN
    RETURN jsonb_build_object('ok', false, 'error', 'rule', 'message', SQLERRM);
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', 'server', 'message', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.create_rival_challenge(
  public.rival_challenge_mode,
  uuid,
  uuid,
  text,
  text,
  uuid,
  timestamptz,
  public.skill_level,
  text,
  text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_rival_challenge(
  public.rival_challenge_mode,
  uuid,
  uuid,
  text,
  text,
  uuid,
  timestamptz,
  public.skill_level,
  text,
  text
) TO authenticated;


CREATE OR REPLACE FUNCTION public.respond_rival_challenge(
  p_challenge_id uuid,
  p_accept boolean,
  p_my_team_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ch RECORD;
  challenger_team RECORD;
  accepted_team RECORD;
  v_accepted_team_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  SELECT * INTO ch
  FROM public.rival_challenges
  WHERE id = p_challenge_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF ch.status IS DISTINCT FROM 'pending' THEN
    RETURN jsonb_build_object('ok', true);
  END IF;

  -- Decline: permitido a staff del equipo desafiado (direct) o a staff del equipo elegido (open),
  -- y al challenger para cancelar (no cubrimos cancel aquí; solo decline).
  IF COALESCE(p_accept, false) IS DISTINCT FROM true THEN
    IF ch.mode = 'direct' THEN
      IF ch.challenged_team_id IS NULL OR NOT public.is_team_staff_captain(ch.challenged_team_id) THEN
        RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
      END IF;
    ELSE
      -- open: solo el staff que va a tomar el desafío puede declinarlo (equivalente a no aceptar).
      IF p_my_team_id IS NULL OR NOT public.is_team_staff_captain(p_my_team_id) THEN
        RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
      END IF;
    END IF;

    UPDATE public.rival_challenges
    SET status = 'declined',
        responded_at = now(),
        accepted_team_id = NULL,
        accepted_captain_id = auth.uid()
    WHERE id = p_challenge_id;

    RETURN jsonb_build_object('ok', true);
  END IF;

  -- Accept
  IF ch.mode = 'direct' THEN
    v_accepted_team_id := ch.challenged_team_id;
    IF v_accepted_team_id IS NULL OR NOT public.is_team_staff_captain(v_accepted_team_id) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
    END IF;
  ELSE
    IF p_my_team_id IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'missing_team');
    END IF;
    IF NOT public.is_team_staff_captain(p_my_team_id) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
    END IF;
    IF p_my_team_id = ch.challenger_team_id THEN
      RETURN jsonb_build_object('ok', false, 'error', 'same_team');
    END IF;
    v_accepted_team_id := p_my_team_id;
  END IF;

  SELECT id, name INTO challenger_team
  FROM public.teams
  WHERE id = ch.challenger_team_id;

  SELECT id, name INTO accepted_team
  FROM public.teams
  WHERE id = v_accepted_team_id;

  UPDATE public.rival_challenges
  SET status = 'accepted',
      responded_at = now(),
      accepted_team_id = v_accepted_team_id,
      accepted_captain_id = auth.uid(),
      challenged_team_id = CASE WHEN ch.mode = 'open' THEN v_accepted_team_id ELSE ch.challenged_team_id END,
      challenged_captain_id = CASE WHEN ch.mode = 'open' THEN auth.uid() ELSE ch.challenged_captain_id END
  WHERE id = p_challenge_id;

  UPDATE public.match_opportunities
  SET status = 'confirmed',
      title = CASE
        WHEN challenger_team.name IS NOT NULL AND accepted_team.name IS NOT NULL
          THEN challenger_team.name || ' vs ' || accepted_team.name
        ELSE title
      END
  WHERE id = ch.opportunity_id;

  INSERT INTO public.match_opportunity_participants (opportunity_id, user_id, status, is_goalkeeper)
  VALUES (ch.opportunity_id, auth.uid(), 'confirmed', false)
  ON CONFLICT (opportunity_id, user_id)
  DO UPDATE SET status = 'confirmed', is_goalkeeper = false;

  RETURN jsonb_build_object('ok', true);
EXCEPTION
  WHEN check_violation THEN
    RETURN jsonb_build_object('ok', false, 'error', 'rule', 'message', SQLERRM);
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', 'server', 'message', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.respond_rival_challenge(uuid, boolean, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.respond_rival_challenge(uuid, boolean, uuid) TO authenticated;

