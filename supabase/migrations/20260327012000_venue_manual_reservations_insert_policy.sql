-- Permite al dueño del centro ingresar reservas manuales desde dashboard.

DROP POLICY IF EXISTS venue_reservations_insert_owner ON public.venue_reservations;
CREATE POLICY venue_reservations_insert_owner
  ON public.venue_reservations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.venue_courts c
      WHERE c.id = venue_reservations.court_id
        AND public.is_venue_owner(c.venue_id)
    )
  );

GRANT INSERT ON public.venue_reservations TO authenticated;
