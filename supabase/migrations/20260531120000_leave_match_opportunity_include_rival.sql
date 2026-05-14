-- Permitir que un jugador inscrito se salga de partidos tipo rival (misma ventana y motivo que revuelta/team_pick).

CREATE OR REPLACE FUNCTION public.leave_match_opportunity_with_reason(
  p_opportunity_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  mo RECORD;
  v_reason text := trim(coalesce(p_reason, ''));
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  IF char_length(v_reason) < 5 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'reason_required');
  END IF;

  SELECT id, type, date_time, status, creator_id
    INTO mo
  FROM public.match_opportunities
  WHERE id = p_opportunity_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF mo.status IN ('completed', 'cancelled') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_closed');
  END IF;

  IF mo.type NOT IN (
    'players'::public.match_type,
    'open'::public.match_type,
    'team_pick_public'::public.match_type,
    'team_pick_private'::public.match_type,
    'rival'::public.match_type
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_supported_for_type');
  END IF;

  IF mo.creator_id = auth.uid() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'creator_cannot_leave');
  END IF;

  IF now() > mo.date_time - interval '2 hours' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'too_late_leave');
  END IF;

  UPDATE public.match_opportunity_participants
  SET
    status = 'cancelled',
    cancelled_at = now(),
    cancelled_reason = v_reason
  WHERE opportunity_id = p_opportunity_id
    AND user_id = auth.uid()
    AND status IN ('pending', 'confirmed');

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_participant');
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;
