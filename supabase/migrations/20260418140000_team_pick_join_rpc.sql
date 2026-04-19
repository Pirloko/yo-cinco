-- Unirse a partidos team_pick_* con equipo (A/B), rol de encuentro y código (privado).

CREATE OR REPLACE FUNCTION public.join_team_pick_match_opportunity(
  p_opportunity_id uuid,
  p_pick_team text,
  p_encounter_lineup_role text,
  p_join_code text DEFAULT NULL
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
  v_code text := trim(coalesce(p_join_code, ''));
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

  SELECT *
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

  IF mo.status NOT IN ('pending', 'confirmed') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_open');
  END IF;

  IF mo.date_time < date_trunc('day', now()) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'past');
  END IF;

  IF mo.type = 'team_pick_private'::public.match_type THEN
    IF mo.join_code IS NULL OR v_code IS DISTINCT FROM mo.join_code THEN
      RETURN jsonb_build_object('ok', false, 'error', 'invalid_join_code');
    END IF;
  END IF;

  IF mo.creator_id = auth.uid() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'is_creator');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.match_opportunity_participants p
    WHERE p.opportunity_id = p_opportunity_id
      AND p.user_id = auth.uid()
      AND p.status IN ('pending', 'confirmed')
  ) THEN
    RETURN jsonb_build_object('ok', true);
  END IF;

  INSERT INTO public.match_opportunity_participants (
    opportunity_id,
    user_id,
    status,
    is_goalkeeper,
    pick_team,
    encounter_lineup_role
  )
  VALUES (
    p_opportunity_id,
    auth.uid(),
    'confirmed',
    false,
    v_team,
    v_role
  );

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

REVOKE ALL ON FUNCTION public.join_team_pick_match_opportunity(
  uuid,
  text,
  text,
  text
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.join_team_pick_match_opportunity(
  uuid,
  text,
  text,
  text
) TO authenticated;

NOTIFY pgrst, 'reload schema';
