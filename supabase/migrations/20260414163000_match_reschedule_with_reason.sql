-- Reprogramación por organizador con motivo y trazabilidad.
-- Permite cambiar centro (texto), ubicación, fecha y hora en un solo paso.
-- Si cambia la fecha/hora o el centro, los participantes confirmados vuelven a "pending"
-- para forzar reconfirmación del nuevo escenario.

CREATE TABLE IF NOT EXISTS public.match_opportunity_reschedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id UUID NOT NULL REFERENCES public.match_opportunities (id) ON DELETE CASCADE,
  changed_by UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  old_venue TEXT NOT NULL,
  old_location TEXT NOT NULL,
  old_date_time TIMESTAMPTZ NOT NULL,
  new_venue TEXT NOT NULL,
  new_location TEXT NOT NULL,
  new_date_time TIMESTAMPTZ NOT NULL,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_match_opportunity_reschedules_opp_created
  ON public.match_opportunity_reschedules (opportunity_id, created_at DESC);

ALTER TABLE public.match_opportunity_reschedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mor_select_related ON public.match_opportunity_reschedules;
CREATE POLICY mor_select_related
  ON public.match_opportunity_reschedules
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.match_opportunities mo
      WHERE mo.id = opportunity_id
        AND (
          mo.creator_id = auth.uid()
          OR EXISTS (
            SELECT 1
            FROM public.match_opportunity_participants p
            WHERE p.opportunity_id = mo.id
              AND p.user_id = auth.uid()
              AND p.status IN ('pending', 'confirmed')
          )
        )
    )
  );

REVOKE ALL ON TABLE public.match_opportunity_reschedules FROM PUBLIC;
GRANT SELECT ON TABLE public.match_opportunity_reschedules TO authenticated;

CREATE OR REPLACE FUNCTION public.reschedule_match_opportunity_with_reason(
  p_opportunity_id UUID,
  p_new_venue TEXT,
  p_new_location TEXT,
  p_new_date_time TIMESTAMPTZ,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  mo RECORD;
  v_new_venue TEXT := trim(coalesce(p_new_venue, ''));
  v_new_location TEXT := trim(coalesce(p_new_location, ''));
  v_reason TEXT := trim(coalesce(p_reason, ''));
  v_is_sensitive_change BOOLEAN := false;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  IF char_length(v_new_venue) < 3 OR char_length(v_new_location) < 3 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_location_data');
  END IF;

  IF p_new_date_time IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_datetime');
  END IF;

  IF char_length(v_reason) < 5 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'reason_required');
  END IF;

  SELECT id, creator_id, status, type, date_time, venue, location, venue_reservation_id
    INTO mo
  FROM public.match_opportunities
  WHERE id = p_opportunity_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF auth.uid() IS DISTINCT FROM mo.creator_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_organizer');
  END IF;

  IF mo.status IN ('completed', 'cancelled') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_closed');
  END IF;

  IF mo.venue_reservation_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'has_venue_reservation');
  END IF;

  IF now() > mo.date_time - interval '2 hours' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'too_late_reschedule');
  END IF;

  IF p_new_date_time < now() + interval '2 hours' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'new_time_too_soon');
  END IF;

  IF mo.date_time = p_new_date_time
    AND mo.venue = v_new_venue
    AND mo.location = v_new_location THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_changes');
  END IF;

  v_is_sensitive_change :=
    mo.date_time IS DISTINCT FROM p_new_date_time
    OR mo.venue IS DISTINCT FROM v_new_venue;

  INSERT INTO public.match_opportunity_reschedules (
    opportunity_id,
    changed_by,
    old_venue,
    old_location,
    old_date_time,
    new_venue,
    new_location,
    new_date_time,
    reason
  )
  VALUES (
    mo.id,
    auth.uid(),
    mo.venue,
    mo.location,
    mo.date_time,
    v_new_venue,
    v_new_location,
    p_new_date_time,
    v_reason
  );

  UPDATE public.match_opportunities
  SET
    venue = v_new_venue,
    location = v_new_location,
    date_time = p_new_date_time,
    sports_venue_id = NULL,
    venue_reservation_id = NULL,
    updated_at = now()
  WHERE id = mo.id;

  IF v_is_sensitive_change THEN
    UPDATE public.match_opportunity_participants
    SET status = 'pending'
    WHERE opportunity_id = mo.id
      AND user_id <> mo.creator_id
      AND status = 'confirmed';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'sensitive_change', v_is_sensitive_change
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reschedule_match_opportunity_with_reason(UUID, TEXT, TEXT, TIMESTAMPTZ, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reschedule_match_opportunity_with_reason(UUID, TEXT, TEXT, TIMESTAMPTZ, TEXT) TO authenticated;
