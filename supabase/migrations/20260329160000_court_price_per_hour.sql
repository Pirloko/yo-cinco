-- Precio por hora (CLP) por cancha; se copia a venue_reservations al reservar vía RPC.

ALTER TABLE public.venue_courts
  ADD COLUMN IF NOT EXISTS price_per_hour INTEGER;

ALTER TABLE public.venue_courts
  DROP CONSTRAINT IF EXISTS venue_courts_price_per_hour_nonneg;

ALTER TABLE public.venue_courts
  ADD CONSTRAINT venue_courts_price_per_hour_nonneg CHECK (
    price_per_hour IS NULL OR price_per_hour >= 0
  );

COMMENT ON COLUMN public.venue_courts.price_per_hour IS
  'Precio por hora en CLP (opcional). Se guarda en venue_reservations al crear la reserva.';

-- Participantes del partido pueden leer la reserva vinculada (costo / reparto).
DROP POLICY IF EXISTS venue_reservations_select_match_participant ON public.venue_reservations;
CREATE POLICY venue_reservations_select_match_participant
  ON public.venue_reservations FOR SELECT TO authenticated
  USING (
    match_opportunity_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.match_opportunity_participants p
      WHERE p.opportunity_id = venue_reservations.match_opportunity_id
        AND p.user_id = auth.uid()
        AND p.status IN ('pending', 'confirmed')
    )
  );

CREATE OR REPLACE FUNCTION public.book_venue_slot(
  p_venue_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_court_id uuid;
  v_res_id uuid;
  v_price integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.sports_venues v WHERE v.id = p_venue_id) THEN
    RAISE EXCEPTION 'venue_not_found';
  END IF;

  SELECT c.id, c.price_per_hour INTO v_court_id, v_price
  FROM public.venue_courts c
  WHERE c.venue_id = p_venue_id
    AND NOT EXISTS (
      SELECT 1 FROM public.venue_reservations r
      WHERE r.court_id = c.id
        AND r.status IN ('pending', 'confirmed')
        AND r.starts_at < p_ends_at
        AND r.ends_at > p_starts_at
    )
  ORDER BY c.sort_order, c.name, c.id
  LIMIT 1;

  IF v_court_id IS NULL THEN
    RAISE EXCEPTION 'no_court_available';
  END IF;

  INSERT INTO public.venue_reservations (
    court_id,
    starts_at,
    ends_at,
    booker_user_id,
    status,
    payment_status,
    price_per_hour,
    currency
  )
  VALUES (
    v_court_id,
    p_starts_at,
    p_ends_at,
    auth.uid(),
    'pending',
    'unpaid',
    v_price,
    'CLP'
  )
  RETURNING id INTO v_res_id;

  RETURN v_res_id;
END;
$$;
