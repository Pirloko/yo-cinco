-- Unirse vía join_match_opportunity no aplica a team_pick (requiere equipo + rol; siguiente bloque).

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

  IF EXISTS (
    SELECT 1
    FROM public.match_opportunity_participants p
    WHERE p.opportunity_id = p_opportunity_id
      AND p.user_id = auth.uid()
      AND p.status IN ('pending','confirmed')
  ) THEN
    RETURN jsonb_build_object('ok', true);
  END IF;

  INSERT INTO public.match_opportunity_participants (opportunity_id, user_id, status, is_goalkeeper)
  VALUES (p_opportunity_id, auth.uid(), 'confirmed', COALESCE(p_is_goalkeeper, false));

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

NOTIFY pgrst, 'reload schema';
