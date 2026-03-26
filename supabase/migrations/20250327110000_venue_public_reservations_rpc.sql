-- Lectura pública de reservas por rango (solo filas del venue indicado); para huecos en /centro/[id].

CREATE OR REPLACE FUNCTION public.venue_public_reservations_in_range(
  p_venue_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
RETURNS TABLE (
  court_id uuid,
  starts_at timestamptz,
  ends_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.court_id, r.starts_at, r.ends_at
  FROM public.venue_reservations r
  INNER JOIN public.venue_courts c
    ON c.id = r.court_id AND c.venue_id = p_venue_id
  WHERE r.status = 'confirmed'
    AND r.starts_at < p_to
    AND r.ends_at > p_from;
$$;

REVOKE ALL ON FUNCTION public.venue_public_reservations_in_range(uuid, timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.venue_public_reservations_in_range(uuid, timestamptz, timestamptz) TO anon;
GRANT EXECUTE ON FUNCTION public.venue_public_reservations_in_range(uuid, timestamptz, timestamptz) TO authenticated;
