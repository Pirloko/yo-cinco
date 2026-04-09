-- Fase 4 (moderación): mover acciones admin críticas a RPC
-- - actualizar estado/resolución de player_reports
-- - limpiar suspensión / ban de perfiles

CREATE OR REPLACE FUNCTION public.admin_update_player_report_status(
  p_report_id uuid,
  p_status text, -- 'reviewed' | 'dismissed' | 'action_taken'
  p_resolution text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status public.player_report_status;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not_admin' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF lower(p_status) = 'reviewed' THEN
    v_status := 'reviewed'::public.player_report_status;
  ELSIF lower(p_status) = 'dismissed' THEN
    v_status := 'dismissed'::public.player_report_status;
  ELSIF lower(p_status) = 'action_taken' THEN
    v_status := 'action_taken'::public.player_report_status;
  ELSE
    RAISE EXCEPTION 'invalid_status' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.player_reports
  SET status = v_status,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      resolution = p_resolution
  WHERE id = p_report_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_player_report_status(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_update_player_report_status(uuid, text, text) TO authenticated;


CREATE OR REPLACE FUNCTION public.admin_clear_suspension(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not_admin' USING ERRCODE = 'insufficient_privilege';
  END IF;
  UPDATE public.profiles
  SET mod_suspended_until = NULL
  WHERE id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_clear_suspension(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_clear_suspension(uuid) TO authenticated;


CREATE OR REPLACE FUNCTION public.admin_clear_ban(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not_admin' USING ERRCODE = 'insufficient_privilege';
  END IF;
  UPDATE public.profiles
  SET mod_banned_at = NULL,
      mod_ban_reason = NULL
  WHERE id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_clear_ban(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_clear_ban(uuid) TO authenticated;

