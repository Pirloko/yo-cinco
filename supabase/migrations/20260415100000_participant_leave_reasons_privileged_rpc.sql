-- Motivo de salida (cancelled_reason): solo organizador del partido o cuenta admin.
-- El cliente ya no debe leer cancelled_reason vía REST; usar esta RPC.

CREATE OR REPLACE FUNCTION public.get_match_opportunity_participant_leave_reasons(
  p_opportunity_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  mo_creator UUID;
  items JSONB;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  SELECT creator_id    INTO mo_creator FROM public.match_opportunities
  WHERE id = p_opportunity_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF auth.uid() IS DISTINCT FROM mo_creator THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.profiles pr
      WHERE pr.id = auth.uid()
        AND pr.account_type = 'admin'::public.account_type
    ) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
    END IF;
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'user_id', p.user_id,
        'cancelled_reason', p.cancelled_reason,
        'cancelled_at', p.cancelled_at
      )
    ),
    '[]'::jsonb
  )
    INTO items
  FROM public.match_opportunity_participants p
  WHERE p.opportunity_id = p_opportunity_id
    AND p.status = 'cancelled'
    AND p.cancelled_reason IS NOT NULL
    AND length(trim(p.cancelled_reason)) >= 1;

  RETURN jsonb_build_object('ok', true, 'items', items);
END;
$$;

REVOKE ALL ON FUNCTION public.get_match_opportunity_participant_leave_reasons(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_match_opportunity_participant_leave_reasons(UUID) TO authenticated;
