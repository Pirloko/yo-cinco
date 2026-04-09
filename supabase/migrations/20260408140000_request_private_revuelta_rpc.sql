-- Fase 4 (joins): solicitud externa para revuelta privada (no-miembro)

CREATE OR REPLACE FUNCTION public.request_revuelta_external_join(
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
  WHERE id = p_opportunity_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF mo.type IS DISTINCT FROM 'open' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_open');
  END IF;

  IF mo.private_revuelta_team_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_private');
  END IF;

  IF mo.status NOT IN ('pending', 'confirmed') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_active');
  END IF;

  -- Partido ya pasado: bloquea desde inicio del día (en tz del servidor).
  IF mo.date_time < date_trunc('day', now()) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'past');
  END IF;

  IF public.is_confirmed_team_member(mo.private_revuelta_team_id, auth.uid()) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_member');
  END IF;

  IF public.revuelta_ext_req_has_blocking_row_for_me(p_opportunity_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'duplicate');
  END IF;

  INSERT INTO public.revuelta_external_join_requests (
    opportunity_id,
    requester_id,
    is_goalkeeper,
    status
  )
  VALUES (
    p_opportunity_id,
    auth.uid(),
    COALESCE(p_is_goalkeeper, false),
    'pending'
  );

  RETURN jsonb_build_object('ok', true);
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'error', 'duplicate');
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', 'server', 'message', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.request_revuelta_external_join(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_revuelta_external_join(uuid, boolean) TO authenticated;

