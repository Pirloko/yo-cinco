-- Estadísticas de equipo (V/E/D) en partidos tipo rival cerrados.

ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS stats_wins INTEGER NOT NULL DEFAULT 0 CHECK (stats_wins >= 0),
  ADD COLUMN IF NOT EXISTS stats_draws INTEGER NOT NULL DEFAULT 0 CHECK (stats_draws >= 0),
  ADD COLUMN IF NOT EXISTS stats_losses INTEGER NOT NULL DEFAULT 0 CHECK (stats_losses >= 0);

COMMENT ON COLUMN public.teams.stats_wins IS 'Victorias en partidos rival finalizados.';
COMMENT ON COLUMN public.teams.stats_draws IS 'Empates en partidos rival finalizados.';
COMMENT ON COLUMN public.teams.stats_losses IS 'Derrotas en partidos rival finalizados.';

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
        UPDATE public.teams SET stats_draws = stats_draws + 1 WHERE id = tid_chall;
        UPDATE public.teams SET stats_draws = stats_draws + 1 WHERE id = tid_acc;
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
        UPDATE public.teams SET stats_wins = stats_wins + 1 WHERE id = tid_chall;
        UPDATE public.teams SET stats_losses = stats_losses + 1 WHERE id = tid_acc;
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
        UPDATE public.teams SET stats_wins = stats_wins + 1 WHERE id = tid_acc;
        UPDATE public.teams SET stats_losses = stats_losses + 1 WHERE id = tid_chall;
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
