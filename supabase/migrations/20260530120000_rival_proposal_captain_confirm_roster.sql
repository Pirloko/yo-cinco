-- Partidos rival: propuesta de resultado (organizador) → confirmación o discrepancia del capitán rival → moderación admin.
-- Nómina: hasta 9 por bando (pick_team A=retador, B=aceptado), solo miembros confirmados del equipo.
-- Opción admin: cerrar sin estadísticas de jugadores/equipos (sí cuenta organizador como partido completado vía apply_match_stats).

ALTER TABLE public.match_opportunities
  ADD COLUMN IF NOT EXISTS rival_organizer_proposed_result public.rival_result,
  ADD COLUMN IF NOT EXISTS rival_proposal_disputed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS rival_closure_skip_player_stats boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.match_opportunities.rival_organizer_proposed_result IS
  'Rival: resultado propuesto por el organizador; el capitán rival debe confirmar o discrepar.';
COMMENT ON COLUMN public.match_opportunities.rival_proposal_disputed IS
  'Rival: el capitán rival discrepó; pendiente resolución admin.';
COMMENT ON COLUMN public.match_opportunities.rival_closure_skip_player_stats IS
  'Rival: al completar, no aplicar W/D/L ni stats de equipos (solo marca match_stats_applied_at).';

-- ---------------------------------------------------------------------------
-- Estadísticas: rival sin impacto en jugadores/equipos (organizador ya sumó stats_organized_completed arriba)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_match_stats_from_outcome(p_opp_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  mo RECORD;
  rc RECORD;
  uid uuid;
  ids_a uuid[];
  ids_b uuid[];
  tid_chall uuid;
  tid_acc uuid;
  org_won boolean;
BEGIN
  SELECT * INTO mo FROM public.match_opportunities WHERE id = p_opp_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  IF mo.status IS DISTINCT FROM 'completed'::public.match_status THEN
    RETURN;
  END IF;
  IF mo.match_stats_applied_at IS NOT NULL THEN
    RETURN;
  END IF;

  UPDATE public.profiles
  SET stats_organized_completed = stats_organized_completed + 1
  WHERE id = mo.creator_id;

  IF mo.type = 'players'::public.match_type THEN
    UPDATE public.match_opportunities SET match_stats_applied_at = now() WHERE id = p_opp_id;
    RETURN;
  END IF;

  org_won := false;

  IF mo.type = 'rival'::public.match_type AND mo.rival_result IS NOT NULL THEN
    IF mo.rival_closure_skip_player_stats IS TRUE THEN
      UPDATE public.match_opportunities SET match_stats_applied_at = now() WHERE id = p_opp_id;
      RETURN;
    END IF;

    SELECT * INTO rc
    FROM public.rival_challenges
    WHERE opportunity_id = p_opp_id AND status = 'accepted';

    IF FOUND THEN
      tid_chall := rc.challenger_team_id;
      tid_acc := rc.accepted_team_id;
      IF tid_acc IS NULL THEN
        UPDATE public.match_opportunities SET match_stats_applied_at = now() WHERE id = p_opp_id;
        RETURN;
      END IF;

      IF mo.rival_result = 'draw'::public.rival_result THEN
        FOR uid IN
          SELECT tm.user_id FROM public.team_members tm
          WHERE tm.team_id IN (tid_chall, tid_acc) AND tm.status = 'confirmed'::public.team_member_status
        LOOP
          UPDATE public.profiles SET stats_player_draws = stats_player_draws + 1 WHERE id = uid;
        END LOOP;
        UPDATE public.teams
        SET stats_draws = stats_draws + 1, stats_win_streak = 0, stats_loss_streak = 0
        WHERE id = tid_chall;
        UPDATE public.teams
        SET stats_draws = stats_draws + 1, stats_win_streak = 0, stats_loss_streak = 0
        WHERE id = tid_acc;
      ELSIF mo.rival_result = 'creator_team'::public.rival_result THEN
        FOR uid IN
          SELECT tm.user_id FROM public.team_members tm
          WHERE tm.team_id = tid_chall AND tm.status = 'confirmed'::public.team_member_status
        LOOP
          UPDATE public.profiles SET stats_player_wins = stats_player_wins + 1 WHERE id = uid;
        END LOOP;
        FOR uid IN
          SELECT tm.user_id FROM public.team_members tm
          WHERE tm.team_id = tid_acc AND tm.status = 'confirmed'::public.team_member_status
        LOOP
          UPDATE public.profiles SET stats_player_losses = stats_player_losses + 1 WHERE id = uid;
        END LOOP;
        UPDATE public.teams
        SET stats_wins = stats_wins + 1, stats_win_streak = stats_win_streak + 1, stats_loss_streak = 0
        WHERE id = tid_chall;
        UPDATE public.teams
        SET stats_losses = stats_losses + 1, stats_loss_streak = stats_loss_streak + 1, stats_win_streak = 0
        WHERE id = tid_acc;
        IF mo.creator_id = rc.challenger_captain_id OR EXISTS (
          SELECT 1 FROM public.team_members x WHERE x.team_id = tid_chall AND x.user_id = mo.creator_id AND x.status = 'confirmed'
        ) THEN
          org_won := true;
        END IF;
      ELSE
        FOR uid IN
          SELECT tm.user_id FROM public.team_members tm
          WHERE tm.team_id = tid_acc AND tm.status = 'confirmed'::public.team_member_status
        LOOP
          UPDATE public.profiles SET stats_player_wins = stats_player_wins + 1 WHERE id = uid;
        END LOOP;
        FOR uid IN
          SELECT tm.user_id FROM public.team_members tm
          WHERE tm.team_id = tid_chall AND tm.status = 'confirmed'::public.team_member_status
        LOOP
          UPDATE public.profiles SET stats_player_losses = stats_player_losses + 1 WHERE id = uid;
        END LOOP;
        UPDATE public.teams
        SET stats_wins = stats_wins + 1, stats_win_streak = stats_win_streak + 1, stats_loss_streak = 0
        WHERE id = tid_acc;
        UPDATE public.teams
        SET stats_losses = stats_losses + 1, stats_loss_streak = stats_loss_streak + 1, stats_win_streak = 0
        WHERE id = tid_chall;
        IF EXISTS (
          SELECT 1 FROM public.team_members x WHERE x.team_id = tid_acc AND x.user_id = mo.creator_id AND x.status = 'confirmed'
        ) THEN
          org_won := true;
        END IF;
      END IF;

      IF org_won THEN
        UPDATE public.profiles SET stats_organizer_wins = stats_organizer_wins + 1 WHERE id = mo.creator_id;
      END IF;
    END IF;

    UPDATE public.match_opportunities SET match_stats_applied_at = now() WHERE id = p_opp_id;
    RETURN;
  END IF;

  IF (mo.type = 'team_pick_public'::public.match_type OR mo.type = 'team_pick_private'::public.match_type)
     AND mo.revuelta_result IS NOT NULL THEN
    ids_a := ARRAY(
      SELECT mop.user_id
      FROM public.match_opportunity_participants mop
      WHERE mop.opportunity_id = p_opp_id
        AND mop.pick_team = 'A'
        AND mop.status IN ('confirmed'::public.participant_status, 'pending'::public.participant_status)
    );
    ids_b := ARRAY(
      SELECT mop.user_id
      FROM public.match_opportunity_participants mop
      WHERE mop.opportunity_id = p_opp_id
        AND mop.pick_team = 'B'
        AND mop.status IN ('confirmed'::public.participant_status, 'pending'::public.participant_status)
    );

    IF mo.revuelta_result = 'draw'::public.revuelta_result THEN
      FOREACH uid IN ARRAY ids_a || ids_b LOOP
        UPDATE public.profiles SET stats_player_draws = stats_player_draws + 1 WHERE id = uid;
      END LOOP;
    ELSIF mo.revuelta_result = 'team_a'::public.revuelta_result THEN
      FOREACH uid IN ARRAY ids_a LOOP
        UPDATE public.profiles SET stats_player_wins = stats_player_wins + 1 WHERE id = uid;
      END LOOP;
      FOREACH uid IN ARRAY ids_b LOOP
        UPDATE public.profiles SET stats_player_losses = stats_player_losses + 1 WHERE id = uid;
      END LOOP;
      IF mo.creator_id = ANY (ids_a) THEN
        org_won := true;
      END IF;
    ELSE
      FOREACH uid IN ARRAY ids_b LOOP
        UPDATE public.profiles SET stats_player_wins = stats_player_wins + 1 WHERE id = uid;
      END LOOP;
      FOREACH uid IN ARRAY ids_a LOOP
        UPDATE public.profiles SET stats_player_losses = stats_player_losses + 1 WHERE id = uid;
      END LOOP;
      IF mo.creator_id = ANY (ids_b) THEN
        org_won := true;
      END IF;
    END IF;

    IF org_won THEN
      UPDATE public.profiles SET stats_organizer_wins = stats_organizer_wins + 1 WHERE id = mo.creator_id;
    END IF;

    UPDATE public.match_opportunities SET match_stats_applied_at = now() WHERE id = p_opp_id;
    RETURN;
  END IF;

  IF mo.type = 'open'::public.match_type AND mo.revuelta_result IS NOT NULL AND mo.revuelta_lineup IS NOT NULL THEN
    ids_a := ARRAY(
      SELECT (jsonb_array_elements_text(mo.revuelta_lineup->'teamA'->'userIds'))::uuid
    );
    ids_b := ARRAY(
      SELECT (jsonb_array_elements_text(mo.revuelta_lineup->'teamB'->'userIds'))::uuid
    );

    IF mo.revuelta_result = 'draw'::public.revuelta_result THEN
      FOREACH uid IN ARRAY ids_a || ids_b LOOP
        UPDATE public.profiles SET stats_player_draws = stats_player_draws + 1 WHERE id = uid;
      END LOOP;
    ELSIF mo.revuelta_result = 'team_a'::public.revuelta_result THEN
      FOREACH uid IN ARRAY ids_a LOOP
        UPDATE public.profiles SET stats_player_wins = stats_player_wins + 1 WHERE id = uid;
      END LOOP;
      FOREACH uid IN ARRAY ids_b LOOP
        UPDATE public.profiles SET stats_player_losses = stats_player_losses + 1 WHERE id = uid;
      END LOOP;
      IF mo.creator_id = ANY (ids_a) THEN
        org_won := true;
      END IF;
    ELSE
      FOREACH uid IN ARRAY ids_b LOOP
        UPDATE public.profiles SET stats_player_wins = stats_player_wins + 1 WHERE id = uid;
      END LOOP;
      FOREACH uid IN ARRAY ids_a LOOP
        UPDATE public.profiles SET stats_player_losses = stats_player_losses + 1 WHERE id = uid;
      END LOOP;
      IF mo.creator_id = ANY (ids_b) THEN
        org_won := true;
      END IF;
    END IF;

    IF org_won THEN
      UPDATE public.profiles SET stats_organizer_wins = stats_organizer_wins + 1 WHERE id = mo.creator_id;
    END IF;
  END IF;

  UPDATE public.match_opportunities SET match_stats_applied_at = now() WHERE id = p_opp_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- Organizador: solo propone resultado (no completa hasta confirmación o admin)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.finalize_rival_match(
  p_opportunity_id uuid,
  p_result public.rival_result
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  mo RECORD;
  rc RECORD;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'auth_required';
  END IF;

  SELECT * INTO mo FROM public.match_opportunities WHERE id = p_opportunity_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found';
  END IF;
  IF mo.creator_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'not_organizer';
  END IF;
  IF mo.type IS DISTINCT FROM 'rival'::public.match_type THEN
    RAISE EXCEPTION 'not_rival';
  END IF;
  IF mo.status = 'completed'::public.match_status THEN
    RAISE EXCEPTION 'already_completed';
  END IF;
  IF mo.status = 'cancelled'::public.match_status THEN
    RAISE EXCEPTION 'already_cancelled';
  END IF;
  IF mo.rival_proposal_disputed IS TRUE THEN
    RAISE EXCEPTION 'disputed_pending_admin';
  END IF;

  SELECT * INTO rc FROM public.rival_challenges WHERE opportunity_id = p_opportunity_id;
  IF NOT FOUND OR rc.status IS DISTINCT FROM 'accepted'::public.rival_challenge_status THEN
    RAISE EXCEPTION 'challenge_not_accepted';
  END IF;

  UPDATE public.match_opportunities
  SET
    rival_organizer_proposed_result = p_result,
    rival_proposal_disputed = false,
    rival_captain_vote_challenger = NULL,
    rival_captain_vote_accepted = NULL,
    rival_outcome_disputed = false,
    updated_at = now()
  WHERE id = p_opportunity_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- Capitán rival: confirma propuesta o discrepa (reporte moderación)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.respond_rival_match_proposal(
  p_opportunity_id uuid,
  p_confirm boolean,
  p_dispute_details text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  mo RECORD;
  rc RECORD;
  responder uuid;
  prop public.rival_result;
  det text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'auth_required';
  END IF;

  SELECT * INTO mo FROM public.match_opportunities WHERE id = p_opportunity_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found';
  END IF;
  IF mo.type IS DISTINCT FROM 'rival'::public.match_type THEN
    RAISE EXCEPTION 'not_rival';
  END IF;
  IF mo.status = 'completed'::public.match_status THEN
    RAISE EXCEPTION 'already_completed';
  END IF;
  IF mo.rival_organizer_proposed_result IS NULL THEN
    RAISE EXCEPTION 'no_proposal';
  END IF;
  IF mo.rival_proposal_disputed IS TRUE THEN
    RAISE EXCEPTION 'already_disputed';
  END IF;

  SELECT * INTO rc FROM public.rival_challenges WHERE opportunity_id = p_opportunity_id;
  IF NOT FOUND OR rc.status IS DISTINCT FROM 'accepted'::public.rival_challenge_status THEN
    RAISE EXCEPTION 'challenge_not_accepted';
  END IF;
  IF rc.accepted_team_id IS NULL THEN
    RAISE EXCEPTION 'no_accepted_team';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.team_members tm
    WHERE tm.team_id = rc.challenger_team_id
      AND tm.user_id = mo.creator_id
      AND tm.status = 'confirmed'::public.team_member_status
  ) THEN
    responder := rc.accepted_captain_id;
  ELSIF EXISTS (
    SELECT 1
    FROM public.team_members tm
    WHERE tm.team_id = rc.accepted_team_id
      AND tm.user_id = mo.creator_id
      AND tm.status = 'confirmed'::public.team_member_status
  ) THEN
    responder := rc.challenger_captain_id;
  ELSE
    responder := rc.accepted_captain_id;
  END IF;

  IF responder IS NULL OR auth.uid() IS DISTINCT FROM responder THEN
    RAISE EXCEPTION 'not_rival_response_captain';
  END IF;

  prop := mo.rival_organizer_proposed_result;

  IF COALESCE(p_confirm, false) IS TRUE THEN
    UPDATE public.match_opportunities
    SET
      rival_result = prop,
      rival_organizer_proposed_result = NULL,
      status = 'completed'::public.match_status,
      finalized_at = now(),
      rival_outcome_disputed = false,
      rival_proposal_disputed = false,
      rival_closure_skip_player_stats = false,
      updated_at = now()
    WHERE id = p_opportunity_id;
    RETURN;
  END IF;

  det := trim(coalesce(p_dispute_details, ''));
  IF char_length(det) < 5 THEN
    RAISE EXCEPTION 'dispute_details_required';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.player_reports pr
    WHERE pr.context_type = 'rival_result_dispute'
      AND pr.context_id = p_opportunity_id
      AND pr.status = 'pending'::public.player_report_status
  ) THEN
    RAISE EXCEPTION 'report_already_open';
  END IF;

  UPDATE public.match_opportunities
  SET
    rival_proposal_disputed = true,
    updated_at = now()
  WHERE id = p_opportunity_id;

  INSERT INTO public.player_reports (
    reporter_id,
    reported_user_id,
    context_type,
    context_id,
    reason,
    details,
    status
  )
  VALUES (
    auth.uid(),
    mo.creator_id,
    'rival_result_dispute',
    p_opportunity_id,
    'Discrepancia en resultado (partido rival)',
    format(
      'Propuesta del organizador: %s. Motivo del capitán: %s',
      prop::text,
      det
    ),
    'pending'::public.player_report_status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.respond_rival_match_proposal(uuid, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.respond_rival_match_proposal(uuid, boolean, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Admin: resolver discrepancia
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_resolve_rival_dispute(
  p_opportunity_id uuid,
  p_result public.rival_result,
  p_skip_player_and_team_stats boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  mo RECORD;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not_admin' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO mo FROM public.match_opportunities WHERE id = p_opportunity_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found';
  END IF;
  IF mo.type IS DISTINCT FROM 'rival'::public.match_type THEN
    RAISE EXCEPTION 'not_rival';
  END IF;
  IF mo.status = 'completed'::public.match_status THEN
    RAISE EXCEPTION 'already_completed';
  END IF;
  IF mo.rival_proposal_disputed IS NOT TRUE THEN
    RAISE EXCEPTION 'not_disputed';
  END IF;

  UPDATE public.match_opportunities
  SET
    rival_result = p_result,
    rival_organizer_proposed_result = NULL,
    rival_proposal_disputed = false,
    rival_outcome_disputed = false,
    rival_closure_skip_player_stats = COALESCE(p_skip_player_and_team_stats, false),
    status = 'completed'::public.match_status,
    finalized_at = now(),
    updated_at = now()
  WHERE id = p_opportunity_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_resolve_rival_dispute(uuid, public.rival_result, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_resolve_rival_dispute(uuid, public.rival_result, boolean) TO authenticated;

-- ---------------------------------------------------------------------------
-- Voto dual capitanes: bloqueado si hay propuesta activa del organizador
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_rival_captain_vote(
  p_opportunity_id uuid,
  p_vote public.rival_result
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rc RECORD;
  mo RECORD;
  v_ch public.rival_result;
  v_ac public.rival_result;
  deadline timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'auth_required';
  END IF;

  SELECT * INTO mo FROM public.match_opportunities WHERE id = p_opportunity_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found';
  END IF;
  IF mo.type IS DISTINCT FROM 'rival'::public.match_type THEN
    RAISE EXCEPTION 'not_rival';
  END IF;
  IF mo.status = 'completed'::public.match_status THEN
    RAISE EXCEPTION 'already_completed';
  END IF;
  IF mo.rival_organizer_proposed_result IS NOT NULL THEN
    RAISE EXCEPTION 'proposal_pending_use_respond';
  END IF;

  SELECT * INTO rc FROM public.rival_challenges WHERE opportunity_id = p_opportunity_id;
  IF NOT FOUND OR rc.status IS DISTINCT FROM 'accepted'::public.rival_challenge_status THEN
    RAISE EXCEPTION 'challenge_not_accepted';
  END IF;
  IF rc.accepted_captain_id IS NULL THEN
    RAISE EXCEPTION 'no_accepted_captain';
  END IF;

  deadline := mo.date_time + interval '72 hours';

  IF auth.uid() = rc.challenger_captain_id THEN
    UPDATE public.match_opportunities
    SET rival_captain_vote_challenger = p_vote, updated_at = now()
    WHERE id = p_opportunity_id;
  ELSIF auth.uid() = rc.accepted_captain_id THEN
    UPDATE public.match_opportunities
    SET rival_captain_vote_accepted = p_vote, updated_at = now()
    WHERE id = p_opportunity_id;
  ELSE
    RAISE EXCEPTION 'not_captain';
  END IF;

  SELECT rival_captain_vote_challenger, rival_captain_vote_accepted
  INTO v_ch, v_ac
  FROM public.match_opportunities WHERE id = p_opportunity_id;

  IF v_ch IS NOT NULL AND v_ac IS NOT NULL THEN
    IF v_ch = v_ac THEN
      UPDATE public.match_opportunities
      SET
        rival_result = v_ch,
        status = 'completed'::public.match_status,
        finalized_at = now(),
        rival_outcome_disputed = false,
        updated_at = now()
      WHERE id = p_opportunity_id;
    ELSE
      UPDATE public.match_opportunities
      SET rival_outcome_disputed = true, updated_at = now()
      WHERE id = p_opportunity_id;
    END IF;
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- Desempate organizador (votos capitanes distintos): no aplica si hay disputa por propuesta
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.finalize_rival_organizer_override(
  p_opportunity_id uuid,
  p_result public.rival_result
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  mo RECORD;
  deadline timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'auth_required';
  END IF;

  SELECT * INTO mo FROM public.match_opportunities WHERE id = p_opportunity_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found';
  END IF;
  IF mo.creator_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'not_organizer';
  END IF;
  IF mo.type IS DISTINCT FROM 'rival'::public.match_type THEN
    RAISE EXCEPTION 'not_rival';
  END IF;
  IF mo.status = 'completed'::public.match_status THEN
    RAISE EXCEPTION 'already_completed';
  END IF;
  IF mo.rival_proposal_disputed IS TRUE THEN
    RAISE EXCEPTION 'use_admin_for_proposal_dispute';
  END IF;
  IF NOT mo.rival_outcome_disputed THEN
    RAISE EXCEPTION 'not_disputed';
  END IF;

  deadline := mo.date_time + interval '72 hours';
  IF now() < deadline THEN
    RAISE EXCEPTION 'deadline_not_reached';
  END IF;

  UPDATE public.match_opportunities
  SET
    rival_result = p_result,
    status = 'completed'::public.match_status,
    finalized_at = now(),
    rival_outcome_disputed = false,
    updated_at = now()
  WHERE id = p_opportunity_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- Unirse: rival con bando y tope 9
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.join_match_opportunity(
  p_opportunity_id uuid,
  p_is_goalkeeper boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  mo RECORD;
  rc RECORD;
  v_pick char(1);
  cnt_side int;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  SELECT *
    INTO mo
  FROM public.match_opportunities
  WHERE id = p_opportunity_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF mo.type IN (
    'team_pick_public'::public.match_type,
    'team_pick_private'::public.match_type
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'use_team_pick_join_rpc');
  END IF;

  IF mo.creator_id = auth.uid() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'is_creator');
  END IF;

  IF mo.date_time < date_trunc('day', now()) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'past');
  END IF;

  IF mo.type = 'open' AND mo.private_revuelta_team_id IS NOT NULL THEN
    IF NOT public.is_confirmed_team_member(mo.private_revuelta_team_id, auth.uid()) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'private_revuelta_requires_request');
    END IF;
  END IF;

  IF mo.type = 'rival'::public.match_type THEN
    SELECT * INTO rc
    FROM public.rival_challenges
    WHERE opportunity_id = p_opportunity_id;

    IF NOT FOUND OR rc.status IS DISTINCT FROM 'accepted'::public.rival_challenge_status THEN
      RETURN jsonb_build_object('ok', false, 'error', 'rival_not_ready');
    END IF;
    IF rc.accepted_team_id IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'rival_not_ready');
    END IF;

    IF public.is_confirmed_team_member(rc.challenger_team_id, auth.uid())
       AND NOT public.is_confirmed_team_member(rc.accepted_team_id, auth.uid()) THEN
      v_pick := 'A';
    ELSIF public.is_confirmed_team_member(rc.accepted_team_id, auth.uid())
       AND NOT public.is_confirmed_team_member(rc.challenger_team_id, auth.uid()) THEN
      v_pick := 'B';
    ELSIF public.is_confirmed_team_member(rc.challenger_team_id, auth.uid())
       AND public.is_confirmed_team_member(rc.accepted_team_id, auth.uid()) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'rival_team_ambiguous');
    ELSE
      RETURN jsonb_build_object('ok', false, 'error', 'rival_not_team_member');
    END IF;

    SELECT COUNT(*)::int INTO cnt_side
    FROM public.match_opportunity_participants p
    WHERE p.opportunity_id = p_opportunity_id
      AND p.pick_team = v_pick
      AND p.status IN ('pending', 'confirmed')
      AND p.user_id IS DISTINCT FROM auth.uid();

    IF cnt_side >= 9 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'rival_team_full');
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.match_opportunity_participants p
    WHERE p.opportunity_id = p_opportunity_id
      AND p.user_id = auth.uid()
      AND p.status IN ('pending','confirmed')
  ) THEN
    RETURN jsonb_build_object('ok', true);
  END IF;

  IF mo.type = 'rival'::public.match_type THEN
    INSERT INTO public.match_opportunity_participants (
      opportunity_id, user_id, status, is_goalkeeper, pick_team
    )
    VALUES (
      p_opportunity_id,
      auth.uid(),
      'confirmed',
      COALESCE(p_is_goalkeeper, false),
      v_pick
    );
  ELSE
    INSERT INTO public.match_opportunity_participants (opportunity_id, user_id, status, is_goalkeeper)
    VALUES (p_opportunity_id, auth.uid(), 'confirmed', COALESCE(p_is_goalkeeper, false));
  END IF;

  RETURN jsonb_build_object('ok', true);
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', true);
  WHEN check_violation THEN
    RETURN jsonb_build_object('ok', false, 'error', 'rule', 'message', SQLERRM);
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', 'server', 'message', SQLERRM);
END;
$$;

-- Aceptar desafío: bando B explícito
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

  IF COALESCE(p_accept, false) IS DISTINCT FROM true THEN
    IF ch.mode = 'direct' THEN
      IF ch.challenged_team_id IS NULL OR NOT public.is_team_staff_captain(ch.challenged_team_id) THEN
        RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
      END IF;
    ELSE
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
      END,
      players_needed = 18
  WHERE id = ch.opportunity_id;

  INSERT INTO public.match_opportunity_participants (
    opportunity_id, user_id, status, is_goalkeeper, pick_team
  )
  VALUES (ch.opportunity_id, auth.uid(), 'confirmed', false, 'B')
  ON CONFLICT (opportunity_id, user_id)
  DO UPDATE SET
    status = 'confirmed',
    is_goalkeeper = false,
    pick_team = COALESCE(public.match_opportunity_participants.pick_team, EXCLUDED.pick_team);

  RETURN jsonb_build_object('ok', true);
EXCEPTION
  WHEN check_violation THEN
    RETURN jsonb_build_object('ok', false, 'error', 'rule', 'message', SQLERRM);
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', 'server', 'message', SQLERRM);
END;
$$;

-- ---------------------------------------------------------------------------
-- Reseñas al equipo rival (post-partido)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rival_team_match_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id uuid NOT NULL REFERENCES public.match_opportunities (id) ON DELETE CASCADE,
  author_user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  target_team_id uuid NOT NULL REFERENCES public.teams (id) ON DELETE CASCADE,
  stars integer NOT NULL CHECK (stars >= 1 AND stars <= 5),
  comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rival_team_match_reviews_unique_author_target UNIQUE (opportunity_id, author_user_id, target_team_id)
);

CREATE INDEX IF NOT EXISTS idx_rival_team_reviews_opp ON public.rival_team_match_reviews (opportunity_id);

ALTER TABLE public.rival_team_match_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rival_team_reviews_select_participants ON public.rival_team_match_reviews;
CREATE POLICY rival_team_reviews_select_participants
  ON public.rival_team_match_reviews
  FOR SELECT
  TO authenticated
  USING (
    public.is_admin()
    OR author_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.match_opportunity_participants p
      WHERE p.opportunity_id = rival_team_match_reviews.opportunity_id
        AND p.user_id = auth.uid()
        AND p.status IN ('pending', 'confirmed')
    )
  );

CREATE OR REPLACE FUNCTION public.submit_rival_team_match_review(
  p_opportunity_id uuid,
  p_target_team_id uuid,
  p_stars integer,
  p_comment text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  mo RECORD;
  rc RECORD;
  other_team uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'auth_required';
  END IF;
  IF p_stars IS NULL OR p_stars < 1 OR p_stars > 5 THEN
    RAISE EXCEPTION 'invalid_stars';
  END IF;

  SELECT * INTO mo FROM public.match_opportunities WHERE id = p_opportunity_id;
  IF NOT FOUND OR mo.type IS DISTINCT FROM 'rival'::public.match_type THEN
    RAISE EXCEPTION 'not_rival';
  END IF;
  IF mo.status IS DISTINCT FROM 'completed'::public.match_status THEN
    RAISE EXCEPTION 'not_completed';
  END IF;

  SELECT * INTO rc FROM public.rival_challenges WHERE opportunity_id = p_opportunity_id AND status = 'accepted';
  IF NOT FOUND OR rc.accepted_team_id IS NULL THEN
    RAISE EXCEPTION 'challenge_not_accepted';
  END IF;

  IF p_target_team_id NOT IN (rc.challenger_team_id, rc.accepted_team_id) THEN
    RAISE EXCEPTION 'invalid_target_team';
  END IF;

  IF NOT public.is_confirmed_team_member(rc.challenger_team_id, auth.uid())
     AND NOT public.is_confirmed_team_member(rc.accepted_team_id, auth.uid()) THEN
    RAISE EXCEPTION 'not_team_member';
  END IF;

  IF public.is_confirmed_team_member(rc.challenger_team_id, auth.uid())
     AND public.is_confirmed_team_member(rc.accepted_team_id, auth.uid()) THEN
    RAISE EXCEPTION 'ambiguous_member';
  END IF;

  IF public.is_confirmed_team_member(rc.challenger_team_id, auth.uid()) THEN
    other_team := rc.accepted_team_id;
  ELSE
    other_team := rc.challenger_team_id;
  END IF;

  IF p_target_team_id IS DISTINCT FROM other_team THEN
    RAISE EXCEPTION 'must_review_opponent_team';
  END IF;

  INSERT INTO public.rival_team_match_reviews (
    opportunity_id, author_user_id, target_team_id, stars, comment
  )
  VALUES (
    p_opportunity_id,
    auth.uid(),
    p_target_team_id,
    p_stars,
    NULLIF(trim(coalesce(p_comment, '')), '')
  )
  ON CONFLICT (opportunity_id, author_user_id, target_team_id)
  DO UPDATE SET
    stars = EXCLUDED.stars,
    comment = EXCLUDED.comment,
    created_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.submit_rival_team_match_review(uuid, uuid, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_rival_team_match_review(uuid, uuid, integer, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Vista cliente (nuevas columnas rival)
-- ---------------------------------------------------------------------------
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
  mo.rival_organizer_proposed_result,
  mo.rival_proposal_disputed,
  mo.rival_closure_skip_player_stats,
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
