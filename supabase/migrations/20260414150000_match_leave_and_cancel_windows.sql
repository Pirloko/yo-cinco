-- Reglas de salida/cancelación con motivo obligatorio:
-- - players/open: participante puede salirse hasta 2 horas antes.
-- - rival: cualquiera de los dos capitanes puede cancelar hasta 24 horas antes.

ALTER TABLE public.match_opportunity_participants
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_reason TEXT;

ALTER TABLE public.match_opportunity_participants
  DROP CONSTRAINT IF EXISTS mop_cancelled_reason_len;
ALTER TABLE public.match_opportunity_participants
  ADD CONSTRAINT mop_cancelled_reason_len
  CHECK (
    cancelled_reason IS NULL
    OR (
      char_length(trim(cancelled_reason)) >= 5
      AND char_length(cancelled_reason) <= 1000
    )
  );

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

  IF mo.type NOT IN ('players', 'open') THEN
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

REVOKE ALL ON FUNCTION public.leave_match_opportunity_with_reason(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.leave_match_opportunity_with_reason(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.cancel_match_opportunity_with_reason(
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
  ch RECORD;
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

  IF mo.type = 'rival' THEN
    SELECT challenger_captain_id, challenged_captain_id, accepted_captain_id, status
      INTO ch
    FROM public.rival_challenges
    WHERE opportunity_id = p_opportunity_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'error', 'challenge_not_found');
    END IF;

    IF auth.uid() IS DISTINCT FROM ch.challenger_captain_id
      AND auth.uid() IS DISTINCT FROM ch.challenged_captain_id
      AND auth.uid() IS DISTINCT FROM ch.accepted_captain_id THEN
      RETURN jsonb_build_object('ok', false, 'error', 'not_rival_captain');
    END IF;

    IF now() > mo.date_time - interval '24 hours' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'too_late_rival_cancel');
    END IF;

    UPDATE public.rival_challenges
    SET
      status = 'cancelled',
      responded_at = coalesce(responded_at, now())
    WHERE opportunity_id = p_opportunity_id
      AND status <> 'cancelled';
  ELSE
    IF auth.uid() IS DISTINCT FROM mo.creator_id THEN
      RETURN jsonb_build_object('ok', false, 'error', 'not_organizer');
    END IF;
  END IF;

  UPDATE public.match_opportunities
  SET
    status = 'cancelled',
    suspended_at = now(),
    suspended_reason = v_reason,
    updated_at = now()
  WHERE id = p_opportunity_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_match_opportunity_with_reason(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_match_opportunity_with_reason(uuid, text) TO authenticated;
