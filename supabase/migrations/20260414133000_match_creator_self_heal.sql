-- Refuerzo: re-asignar partidos creados por cuentas duplicadas al usuario actual.
-- Cubre especialmente revueltas privadas (requieren miembro confirmado del equipo).

CREATE OR REPLACE FUNCTION public.reassign_match_creators(
  p_source_user_id uuid,
  p_target_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_moved integer := 0;
BEGIN
  IF p_source_user_id IS NULL OR p_target_user_id IS NULL THEN
    RAISE EXCEPTION 'source_and_target_required';
  END IF;
  IF p_source_user_id = p_target_user_id THEN
    RETURN jsonb_build_object('ok', true, 'moved', 0);
  END IF;

  -- Si el partido es revuelta privada, el creador debe ser miembro confirmado del equipo.
  -- Inserta al destino como miembro confirmado si aún no está, para permitir el UPDATE.
  INSERT INTO public.team_members (team_id, user_id, position, photo_url, status)
  SELECT DISTINCT
    mo.private_revuelta_team_id,
    p_target_user_id,
    coalesce(src_tm.position, prof.position, 'mediocampista'::public.position),
    coalesce(src_tm.photo_url, prof.photo_url, ''),
    'confirmed'::public.team_member_status
  FROM public.match_opportunities mo
  LEFT JOIN public.team_members src_tm
    ON src_tm.team_id = mo.private_revuelta_team_id
   AND src_tm.user_id = p_source_user_id
  LEFT JOIN public.profiles prof
    ON prof.id = p_target_user_id
  WHERE mo.creator_id = p_source_user_id
    AND mo.private_revuelta_team_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.team_members tm
      WHERE tm.team_id = mo.private_revuelta_team_id
        AND tm.user_id = p_target_user_id
    );

  UPDATE public.match_opportunities
  SET creator_id = p_target_user_id
  WHERE creator_id = p_source_user_id;

  GET DIAGNOSTICS v_moved = ROW_COUNT;

  RETURN jsonb_build_object(
    'ok', true,
    'sourceUserId', p_source_user_id,
    'targetUserId', p_target_user_id,
    'moved', v_moved
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reassign_match_creators(uuid, uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.self_heal_match_creators_by_email()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_current uuid := auth.uid();
  v_email text := lower(trim(coalesce(auth.jwt() ->> 'email', '')));
  v_source uuid;
  v_total integer := 0;
  v_row jsonb;
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
  LOOP
    SELECT public.reassign_match_creators(v_source, v_current) INTO v_row;
    v_total := v_total + coalesce((v_row ->> 'moved')::integer, 0);
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'targetUserId', v_current,
    'moved', v_total
  );
END;
$$;

REVOKE ALL ON FUNCTION public.self_heal_match_creators_by_email() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.self_heal_match_creators_by_email() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_reassign_match_creators(
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
  RETURN public.reassign_match_creators(p_source_user_id, p_target_user_id);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_reassign_match_creators(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_reassign_match_creators(uuid, uuid) TO authenticated;
