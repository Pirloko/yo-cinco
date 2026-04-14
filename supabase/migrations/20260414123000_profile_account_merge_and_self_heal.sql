-- Fusión de cuentas duplicadas de perfil (mismo usuario real con distinto UUID auth).
-- Caso típico: usuario crea otra cuenta OAuth por error y "pierde" propiedad/capitanía.

CREATE OR REPLACE FUNCTION public.merge_profile_accounts(
  p_source_user_id uuid,
  p_target_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_source public.profiles%ROWTYPE;
  v_target public.profiles%ROWTYPE;
BEGIN
  IF p_source_user_id IS NULL OR p_target_user_id IS NULL THEN
    RAISE EXCEPTION 'source_and_target_required';
  END IF;
  IF p_source_user_id = p_target_user_id THEN
    RAISE EXCEPTION 'source_and_target_must_differ';
  END IF;

  SELECT * INTO v_source FROM public.profiles WHERE id = p_source_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'source_profile_not_found';
  END IF;
  SELECT * INTO v_target FROM public.profiles WHERE id = p_target_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'target_profile_not_found';
  END IF;

  -- 1) Tablas con clave compuesta (deduplicar antes de UPDATE).
  DELETE FROM public.match_opportunity_participants src
  USING public.match_opportunity_participants dst
  WHERE src.user_id = p_source_user_id
    AND dst.user_id = p_target_user_id
    AND dst.opportunity_id = src.opportunity_id;
  UPDATE public.match_opportunity_participants
  SET user_id = p_target_user_id
  WHERE user_id = p_source_user_id;

  DELETE FROM public.match_participants src
  USING public.match_participants dst
  WHERE src.user_id = p_source_user_id
    AND dst.user_id = p_target_user_id
    AND dst.match_id = src.match_id;
  UPDATE public.match_participants
  SET user_id = p_target_user_id
  WHERE user_id = p_source_user_id;

  DELETE FROM public.team_members src
  USING public.team_members dst
  WHERE src.user_id = p_source_user_id
    AND dst.user_id = p_target_user_id
    AND dst.team_id = src.team_id;
  UPDATE public.team_members
  SET user_id = p_target_user_id
  WHERE user_id = p_source_user_id;

  DELETE FROM public.match_opportunity_ratings src
  USING public.match_opportunity_ratings dst
  WHERE src.rater_id = p_source_user_id
    AND dst.rater_id = p_target_user_id
    AND dst.opportunity_id = src.opportunity_id;
  UPDATE public.match_opportunity_ratings
  SET rater_id = p_target_user_id
  WHERE rater_id = p_source_user_id;

  -- sports_venue_reviews: una por reserva.
  DELETE FROM public.sports_venue_reviews src
  USING public.sports_venue_reviews dst
  WHERE src.reviewer_id = p_source_user_id
    AND dst.reviewer_id = p_target_user_id
    AND dst.venue_reservation_id = src.venue_reservation_id;
  UPDATE public.sports_venue_reviews
  SET reviewer_id = p_target_user_id
  WHERE reviewer_id = p_source_user_id;

  -- team_invites: deduplicar pendientes por (team_id, invitee_id).
  DELETE FROM public.team_invites src
  USING public.team_invites dst
  WHERE src.invitee_id = p_source_user_id
    AND dst.invitee_id = p_target_user_id
    AND dst.team_id = src.team_id
    AND src.status = 'pending'
    AND dst.status = 'pending';
  UPDATE public.team_invites
  SET invitee_id = p_target_user_id
  WHERE invitee_id = p_source_user_id;
  UPDATE public.team_invites
  SET inviter_id = p_target_user_id
  WHERE inviter_id = p_source_user_id;
  DELETE FROM public.team_invites
  WHERE inviter_id = invitee_id;

  -- team_join_requests: deduplicar pendientes por (team_id, requester_id).
  DELETE FROM public.team_join_requests src
  USING public.team_join_requests dst
  WHERE src.requester_id = p_source_user_id
    AND dst.requester_id = p_target_user_id
    AND dst.team_id = src.team_id
    AND src.status = 'pending'
    AND dst.status = 'pending';
  UPDATE public.team_join_requests
  SET requester_id = p_target_user_id
  WHERE requester_id = p_source_user_id;

  -- 2) Tablas simples (FK directa a profiles.id).
  UPDATE public.match_opportunities
  SET creator_id = p_target_user_id
  WHERE creator_id = p_source_user_id;

  UPDATE public.messages
  SET sender_id = p_target_user_id
  WHERE sender_id = p_source_user_id;

  UPDATE public.teams
  SET captain_id = p_target_user_id
  WHERE captain_id = p_source_user_id;

  UPDATE public.teams
  SET vice_captain_id = p_target_user_id
  WHERE vice_captain_id = p_source_user_id;

  UPDATE public.rival_challenges
  SET challenger_captain_id = p_target_user_id
  WHERE challenger_captain_id = p_source_user_id;
  UPDATE public.rival_challenges
  SET challenged_captain_id = p_target_user_id
  WHERE challenged_captain_id = p_source_user_id;
  UPDATE public.rival_challenges
  SET accepted_captain_id = p_target_user_id
  WHERE accepted_captain_id = p_source_user_id;

  UPDATE public.sports_venues
  SET owner_id = p_target_user_id
  WHERE owner_id = p_source_user_id;

  UPDATE public.venue_reservations
  SET booker_user_id = p_target_user_id
  WHERE booker_user_id = p_source_user_id;
  UPDATE public.venue_reservations
  SET confirmed_by_user_id = p_target_user_id
  WHERE confirmed_by_user_id = p_source_user_id;

  UPDATE public.venue_reservation_payment_history
  SET actor_user_id = p_target_user_id
  WHERE actor_user_id = p_source_user_id;

  UPDATE public.player_reports
  SET reporter_id = p_target_user_id
  WHERE reporter_id = p_source_user_id;
  UPDATE public.player_reports
  SET reported_user_id = p_target_user_id
  WHERE reported_user_id = p_source_user_id;
  UPDATE public.player_reports
  SET reviewed_by = p_target_user_id
  WHERE reviewed_by = p_source_user_id;

  UPDATE public.revuelta_external_join_requests
  SET requester_id = p_target_user_id
  WHERE requester_id = p_source_user_id;

  UPDATE public.app_user_feedback
  SET user_id = p_target_user_id
  WHERE user_id = p_source_user_id;

  -- 3) Consolidar algunos campos del perfil destino.
  UPDATE public.profiles
  SET
    name = CASE
      WHEN char_length(trim(coalesce(name, ''))) = 0
      THEN coalesce(NULLIF(trim(v_source.name), ''), name)
      ELSE name
    END,
    photo_url = CASE
      WHEN coalesce(trim(photo_url), '') = ''
      THEN coalesce(NULLIF(trim(v_source.photo_url), ''), photo_url)
      ELSE photo_url
    END,
    whatsapp_phone = CASE
      WHEN coalesce(trim(whatsapp_phone), '') = ''
      THEN coalesce(NULLIF(trim(v_source.whatsapp_phone), ''), whatsapp_phone)
      ELSE whatsapp_phone
    END,
    player_essentials_completed_at = coalesce(player_essentials_completed_at, v_source.player_essentials_completed_at),
    birth_date = coalesce(birth_date, v_source.birth_date),
    stats_player_wins = coalesce(stats_player_wins, 0) + coalesce(v_source.stats_player_wins, 0),
    stats_player_draws = coalesce(stats_player_draws, 0) + coalesce(v_source.stats_player_draws, 0),
    stats_player_losses = coalesce(stats_player_losses, 0) + coalesce(v_source.stats_player_losses, 0),
    stats_organized_completed = coalesce(stats_organized_completed, 0) + coalesce(v_source.stats_organized_completed, 0),
    stats_organizer_wins = coalesce(stats_organizer_wins, 0) + coalesce(v_source.stats_organizer_wins, 0),
    mod_yellow_cards = GREATEST(coalesce(mod_yellow_cards, 0), coalesce(v_source.mod_yellow_cards, 0)),
    mod_red_cards = GREATEST(coalesce(mod_red_cards, 0), coalesce(v_source.mod_red_cards, 0)),
    mod_suspended_until = GREATEST(mod_suspended_until, v_source.mod_suspended_until),
    mod_banned_at = coalesce(mod_banned_at, v_source.mod_banned_at),
    mod_ban_reason = coalesce(nullif(trim(mod_ban_reason), ''), nullif(trim(v_source.mod_ban_reason), '')),
    mod_last_yellow_at = GREATEST(mod_last_yellow_at, v_source.mod_last_yellow_at),
    mod_last_red_at = GREATEST(mod_last_red_at, v_source.mod_last_red_at),
    last_seen_at = GREATEST(last_seen_at, v_source.last_seen_at),
    updated_at = now()
  WHERE id = p_target_user_id;

  -- 4) Eliminar perfil origen ya migrado.
  DELETE FROM public.profiles WHERE id = p_source_user_id;

  RETURN jsonb_build_object(
    'ok', true,
    'sourceUserId', p_source_user_id,
    'targetUserId', p_target_user_id
  );
END;
$$;

COMMENT ON FUNCTION public.merge_profile_accounts(uuid, uuid) IS
  'Mueve referencias de p_source_user_id a p_target_user_id y borra el perfil origen.';

REVOKE ALL ON FUNCTION public.merge_profile_accounts(uuid, uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.admin_merge_profile_accounts(
  p_source_user_id uuid,
  p_target_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN public.merge_profile_accounts(p_source_user_id, p_target_user_id);
END;
$$;

COMMENT ON FUNCTION public.admin_merge_profile_accounts(uuid, uuid) IS
  'Wrapper admin para fusionar cuentas duplicadas.';

REVOKE ALL ON FUNCTION public.admin_merge_profile_accounts(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_merge_profile_accounts(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.self_heal_duplicate_profile_by_email()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_current uuid := auth.uid();
  v_email text := lower(trim(coalesce(auth.jwt() ->> 'email', '')));
  v_source uuid;
  v_merged integer := 0;
BEGIN
  IF v_current IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_auth_uid');
  END IF;
  IF v_email = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_email_in_jwt');
  END IF;

  FOR v_source IN
    SELECT au.id
    FROM auth.users au
    INNER JOIN public.profiles p ON p.id = au.id
    WHERE au.id <> v_current
      AND lower(trim(coalesce(au.email, ''))) = v_email
    ORDER BY au.created_at ASC
  LOOP
    PERFORM public.merge_profile_accounts(v_source, v_current);
    v_merged := v_merged + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'mergedCount', v_merged,
    'targetUserId', v_current
  );
END;
$$;

COMMENT ON FUNCTION public.self_heal_duplicate_profile_by_email() IS
  'Autorrepara cuentas duplicadas con mismo email (migra referencias al auth.uid actual).';

REVOKE ALL ON FUNCTION public.self_heal_duplicate_profile_by_email() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.self_heal_duplicate_profile_by_email() TO authenticated;
