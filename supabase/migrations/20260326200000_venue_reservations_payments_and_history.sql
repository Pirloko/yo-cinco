-- Flujo de pagos para reservas de centros deportivos:
-- - venue_reservations.status: pending | confirmed | cancelled
-- - campos de precio/abono/pago + timestamps + motivo de cancelación
-- - historial (venue_reservation_events)
-- - al cancelar una reserva vinculada a un partido, se cancela el partido con motivo

DO $$
BEGIN
  -- Agregar valor 'pending' al enum si no existe.
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'venue_reservation_status'
      AND e.enumlabel = 'pending'
  ) THEN
    ALTER TYPE public.venue_reservation_status ADD VALUE 'pending' BEFORE 'confirmed';
  END IF;
END
$$;

CREATE TYPE public.venue_payment_status AS ENUM ('unpaid', 'deposit_paid', 'paid');

ALTER TABLE public.venue_reservations
  ADD COLUMN IF NOT EXISTS payment_status public.venue_payment_status NOT NULL DEFAULT 'unpaid',
  ADD COLUMN IF NOT EXISTS price_per_hour INTEGER,
  ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'CLP',
  ADD COLUMN IF NOT EXISTS deposit_amount INTEGER,
  ADD COLUMN IF NOT EXISTS paid_amount INTEGER,
  ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_reason TEXT;

-- Backfill: si ya están confirmadas, setear timestamp de confirmación.
UPDATE public.venue_reservations
SET confirmed_at = COALESCE(confirmed_at, created_at)
WHERE status = 'confirmed' AND confirmed_at IS NULL;

-- Historial de eventos
CREATE TABLE IF NOT EXISTS public.venue_reservation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id UUID NOT NULL REFERENCES public.venue_reservations (id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES public.profiles (id) ON DELETE SET NULL,
  kind TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vre_reservation_id ON public.venue_reservation_events (reservation_id, created_at DESC);

ALTER TABLE public.venue_reservation_events ENABLE ROW LEVEL SECURITY;

-- Solo el dueño del centro (por la cancha) o el booker puede ver el historial.
DROP POLICY IF EXISTS venue_reservation_events_select ON public.venue_reservation_events;
CREATE POLICY venue_reservation_events_select
  ON public.venue_reservation_events FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.venue_reservations r
      JOIN public.venue_courts c ON c.id = r.court_id
      WHERE r.id = venue_reservation_events.reservation_id
        AND (
          r.booker_user_id = auth.uid()
          OR public.is_venue_owner(c.venue_id)
        )
    )
  );

-- Solo el dueño del centro puede insertar eventos (para logging interno).
DROP POLICY IF EXISTS venue_reservation_events_insert_owner ON public.venue_reservation_events;
CREATE POLICY venue_reservation_events_insert_owner
  ON public.venue_reservation_events FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.venue_reservations r
      JOIN public.venue_courts c ON c.id = r.court_id
      WHERE r.id = venue_reservation_events.reservation_id
        AND public.is_venue_owner(c.venue_id)
    )
  );

GRANT SELECT, INSERT ON public.venue_reservation_events TO authenticated;

-- Overlap: ahora pending también bloquea (para que no se duplique mientras se paga).
CREATE OR REPLACE FUNCTION public.venue_reservations_check_overlap()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'cancelled' THEN
    RETURN NEW;
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.venue_reservations r
    WHERE r.court_id = NEW.court_id
      AND r.status IN ('pending', 'confirmed')
      AND r.id IS DISTINCT FROM NEW.id
      AND r.starts_at < NEW.ends_at
      AND r.ends_at > NEW.starts_at
  ) THEN
    RAISE EXCEPTION 'venue_reservation_overlap' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

-- Reservar: ahora crea pending (no confirmed)
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
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.sports_venues v WHERE v.id = p_venue_id) THEN
    RAISE EXCEPTION 'venue_not_found';
  END IF;

  SELECT c.id INTO v_court_id
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

  INSERT INTO public.venue_reservations (court_id, starts_at, ends_at, booker_user_id, status, payment_status)
  VALUES (v_court_id, p_starts_at, p_ends_at, auth.uid(), 'pending', 'unpaid')
  RETURNING id INTO v_res_id;

  RETURN v_res_id;
END;
$$;

-- Al cancelar una reserva vinculada a un partido, cancelar el partido (historial para organizador).
CREATE OR REPLACE FUNCTION public.handle_venue_reservation_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'confirmed' AND (OLD.status IS DISTINCT FROM 'confirmed') THEN
    NEW.confirmed_at := COALESCE(NEW.confirmed_at, now());
  END IF;

  IF NEW.status = 'cancelled' AND (OLD.status IS DISTINCT FROM 'cancelled') THEN
    NEW.cancelled_at := COALESCE(NEW.cancelled_at, now());
    IF NEW.match_opportunity_id IS NOT NULL THEN
      UPDATE public.match_opportunities mo
      SET status = 'cancelled',
          suspended_at = now(),
          suspended_reason = COALESCE(NEW.cancelled_reason, 'Reserva cancelada por el centro deportivo')
      WHERE mo.id = NEW.match_opportunity_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_venue_reservation_status_change ON public.venue_reservations;
CREATE TRIGGER trg_venue_reservation_status_change
  BEFORE UPDATE ON public.venue_reservations
  FOR EACH ROW EXECUTE PROCEDURE public.handle_venue_reservation_status_change();

