-- Resultados revuelta, votos de capitanes (rival), estadísticas en perfiles y trigger de aplicación.

CREATE TYPE public.revuelta_result AS ENUM ('team_a', 'team_b', 'draw');

ALTER TABLE public.match_opportunities
  ADD COLUMN IF NOT EXISTS revuelta_result public.revuelta_result,
  ADD COLUMN IF NOT EXISTS rival_captain_vote_challenger public.rival_result,
  ADD COLUMN IF NOT EXISTS rival_captain_vote_accepted public.rival_result,
  ADD COLUMN IF NOT EXISTS rival_outcome_disputed BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS match_stats_applied_at TIMESTAMPTZ;

COMMENT ON COLUMN public.match_opportunities.revuelta_result IS 'Revuelta (open): ganador equipo A, B o empate.';
COMMENT ON COLUMN public.match_opportunities.rival_captain_vote_challenger IS 'Voto capitán equipo retador (creator_team/rival_team/draw).';
COMMENT ON COLUMN public.match_opportunities.rival_captain_vote_accepted IS 'Voto capitán equipo aceptado.';
COMMENT ON COLUMN public.match_opportunities.rival_outcome_disputed IS 'Votos de capitanes distintos; pendiente desempate organizador.';
COMMENT ON COLUMN public.match_opportunities.match_stats_applied_at IS 'Evita doble conteo de stats al cerrar partido.';

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS stats_player_wins INTEGER NOT NULL DEFAULT 0 CHECK (stats_player_wins >= 0),
  ADD COLUMN IF NOT EXISTS stats_player_draws INTEGER NOT NULL DEFAULT 0 CHECK (stats_player_draws >= 0),
  ADD COLUMN IF NOT EXISTS stats_player_losses INTEGER NOT NULL DEFAULT 0 CHECK (stats_player_losses >= 0),
  ADD COLUMN IF NOT EXISTS stats_organized_completed INTEGER NOT NULL DEFAULT 0 CHECK (stats_organized_completed >= 0),
  ADD COLUMN IF NOT EXISTS stats_organizer_wins INTEGER NOT NULL DEFAULT 0 CHECK (stats_organizer_wins >= 0);

-- ---------------------------------------------------------------------------
-- Aplicar estadísticas cuando el partido queda completed (una sola vez)
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
  win_a boolean;
  win_b boolean;
  is_draw boolean;
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

  -- type players: solo organizador cuenta como organizado (ya arriba); sin W/D/L por equipo
  IF mo.type = 'players'::public.match_type THEN
    UPDATE public.match_opportunities SET match_stats_applied_at = now() WHERE id = p_opp_id;
    RETURN;
  END IF;

  org_won := false;

  IF mo.type = 'rival'::public.match_type AND mo.rival_result IS NOT NULL THEN
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

CREATE OR REPLACE FUNCTION public.trg_match_completed_apply_stats()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'completed'::public.match_status AND (OLD.status IS DISTINCT FROM 'completed'::public.match_status) THEN
    PERFORM public.apply_match_stats_from_outcome(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_match_completed_apply_stats ON public.match_opportunities;
CREATE TRIGGER trg_match_completed_apply_stats
  AFTER UPDATE OF status ON public.match_opportunities
  FOR EACH ROW
  WHEN (NEW.status = 'completed'::public.match_status AND OLD.status IS DISTINCT FROM 'completed'::public.match_status)
  EXECUTE PROCEDURE public.trg_match_completed_apply_stats();

-- ---------------------------------------------------------------------------
-- Voto de capitanes (rival)
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

CREATE OR REPLACE FUNCTION public.finalize_revuelta_match(
  p_opportunity_id uuid,
  p_result public.revuelta_result
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  mo RECORD;
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
  IF mo.type IS DISTINCT FROM 'open'::public.match_type THEN
    RAISE EXCEPTION 'not_open';
  END IF;
  IF mo.status = 'completed'::public.match_status THEN
    RAISE EXCEPTION 'already_completed';
  END IF;

  UPDATE public.match_opportunities
  SET
    revuelta_result = p_result,
    rival_result = NULL,
    casual_completed = NULL,
    status = 'completed'::public.match_status,
    finalized_at = now(),
    updated_at = now()
  WHERE id = p_opportunity_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_rival_captain_vote(uuid, public.rival_result) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_rival_organizer_override(uuid, public.rival_result) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_revuelta_match(uuid, public.revuelta_result) TO authenticated;
