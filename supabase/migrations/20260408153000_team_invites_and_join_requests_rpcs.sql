-- Fase 4 (robustez): aceptar invitaciones y solicitudes de equipo vía RPC (transaccional + idempotente).

CREATE OR REPLACE FUNCTION public.accept_team_invite(p_invite_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv RECORD;
  prof RECORD;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  SELECT * INTO inv
  FROM public.team_invites
  WHERE id = p_invite_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF inv.invitee_id IS DISTINCT FROM auth.uid() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  IF inv.status IS DISTINCT FROM 'pending' THEN
    RETURN jsonb_build_object('ok', true);
  END IF;

  -- Si ya es miembro, marcamos la invitación como aceptada (idempotente).
  IF EXISTS (
    SELECT 1 FROM public.team_members tm
    WHERE tm.team_id = inv.team_id
      AND tm.user_id = auth.uid()
  ) THEN
    UPDATE public.team_invites SET status = 'accepted' WHERE id = p_invite_id;
    RETURN jsonb_build_object('ok', true);
  END IF;

  SELECT position, photo_url INTO prof
  FROM public.profiles
  WHERE id = auth.uid();

  INSERT INTO public.team_members (team_id, user_id, position, photo_url, status)
  VALUES (inv.team_id, auth.uid(), prof.position, COALESCE(prof.photo_url, ''), 'confirmed');

  UPDATE public.team_invites
  SET status = 'accepted'
  WHERE id = p_invite_id;

  RETURN jsonb_build_object('ok', true);
EXCEPTION
  WHEN unique_violation THEN
    UPDATE public.team_invites SET status = 'accepted' WHERE id = p_invite_id;
    RETURN jsonb_build_object('ok', true);
  WHEN check_violation THEN
    RETURN jsonb_build_object('ok', false, 'error', 'rule', 'message', SQLERRM);
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', 'server', 'message', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.accept_team_invite(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_team_invite(uuid) TO authenticated;


CREATE OR REPLACE FUNCTION public.respond_team_join_request(
  p_request_id uuid,
  p_accept boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  req RECORD;
  prof RECORD;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  SELECT * INTO req
  FROM public.team_join_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF NOT public.is_team_captain(req.team_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  IF req.status IS DISTINCT FROM 'pending' THEN
    RETURN jsonb_build_object('ok', true);
  END IF;

  IF COALESCE(p_accept, false) IS DISTINCT FROM true THEN
    UPDATE public.team_join_requests
    SET status = 'declined',
        updated_at = now()
    WHERE id = p_request_id;
    RETURN jsonb_build_object('ok', true);
  END IF;

  -- Si ya es miembro, aceptamos la solicitud (idempotente).
  IF EXISTS (
    SELECT 1 FROM public.team_members tm
    WHERE tm.team_id = req.team_id
      AND tm.user_id = req.requester_id
  ) THEN
    UPDATE public.team_join_requests
    SET status = 'accepted',
        updated_at = now()
    WHERE id = p_request_id;
    RETURN jsonb_build_object('ok', true);
  END IF;

  SELECT position, photo_url INTO prof
  FROM public.profiles
  WHERE id = req.requester_id;

  INSERT INTO public.team_members (team_id, user_id, position, photo_url, status)
  VALUES (req.team_id, req.requester_id, prof.position, COALESCE(prof.photo_url, ''), 'confirmed');

  UPDATE public.team_join_requests
  SET status = 'accepted',
      updated_at = now()
  WHERE id = p_request_id;

  RETURN jsonb_build_object('ok', true);
EXCEPTION
  WHEN unique_violation THEN
    UPDATE public.team_join_requests
    SET status = 'accepted',
        updated_at = now()
    WHERE id = p_request_id;
    RETURN jsonb_build_object('ok', true);
  WHEN check_violation THEN
    RETURN jsonb_build_object('ok', false, 'error', 'rule', 'message', SQLERRM);
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', 'server', 'message', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.respond_team_join_request(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.respond_team_join_request(uuid, boolean) TO authenticated;

