-- Al cambiar el precio por hora de una cancha, propagar a reservas activas
-- (pendientes o confirmadas cuyo turno aún no terminó), para que el panel
-- del centro y los partidos vinculados muestren el valor vigente.

CREATE OR REPLACE FUNCTION public.sync_future_reservations_price_from_court()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.price_per_hour IS DISTINCT FROM OLD.price_per_hour) THEN
    UPDATE public.venue_reservations r
    SET price_per_hour = NEW.price_per_hour
    WHERE r.court_id = NEW.id
      AND r.status IN (
        'pending'::public.venue_reservation_status,
        'confirmed'::public.venue_reservation_status
      )
      AND r.ends_at > now();
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_future_reservations_price_from_court() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_venue_courts_price_sync_future_reservations ON public.venue_courts;

CREATE TRIGGER trg_venue_courts_price_sync_future_reservations
  AFTER UPDATE OF price_per_hour ON public.venue_courts
  FOR EACH ROW
  EXECUTE PROCEDURE public.sync_future_reservations_price_from_court();

COMMENT ON FUNCTION public.sync_future_reservations_price_from_court IS
  'Copia el nuevo price_per_hour de venue_courts a venue_reservations futuras al editar tarifa.';

-- Alinear datos ya existentes: reservas no finalizadas con el precio actual de la cancha.
UPDATE public.venue_reservations r
SET price_per_hour = c.price_per_hour
FROM public.venue_courts c
WHERE r.court_id = c.id
  AND r.status IN (
    'pending'::public.venue_reservation_status,
    'confirmed'::public.venue_reservation_status
  )
  AND r.ends_at > now()
  AND (r.price_per_hour IS DISTINCT FROM c.price_per_hour);

NOTIFY pgrst, 'reload schema';
