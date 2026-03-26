-- Centros deportivos, canchas, horario semanal, reservas y vinculación opcional a partidos.
-- Cuentas `venue`: solo asignar account_type = 'venue' manualmente en DB / service_role.

CREATE TYPE public.account_type AS ENUM ('player', 'venue');

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS account_type public.account_type NOT NULL DEFAULT 'player';

DROP POLICY IF EXISTS profiles_insert_own_id ON public.profiles;
CREATE POLICY profiles_insert_own_id
  ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id AND account_type = 'player');

CREATE TYPE public.venue_reservation_status AS ENUM ('confirmed', 'cancelled');

CREATE TABLE public.sports_venues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address TEXT NOT NULL DEFAULT '',
  maps_url TEXT,
  phone TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT 'Rancagua',
  slot_duration_minutes INTEGER NOT NULL DEFAULT 60
    CHECK (slot_duration_minutes >= 15 AND slot_duration_minutes <= 180),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sports_venues_owner ON public.sports_venues (owner_id);
CREATE INDEX idx_sports_venues_city ON public.sports_venues (city);

CREATE TRIGGER trg_sports_venues_updated
  BEFORE UPDATE ON public.sports_venues
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

CREATE TABLE public.venue_courts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.sports_venues (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_venue_courts_venue ON public.venue_courts (venue_id);

CREATE TABLE public.venue_weekly_hours (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.sports_venues (id) ON DELETE CASCADE,
  day_of_week SMALLINT NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
  open_time TIME NOT NULL,
  close_time TIME NOT NULL,
  UNIQUE (venue_id, day_of_week)
);

ALTER TABLE public.match_opportunities
  ADD COLUMN IF NOT EXISTS sports_venue_id UUID REFERENCES public.sports_venues (id) ON DELETE SET NULL;

CREATE TABLE public.venue_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  court_id UUID NOT NULL REFERENCES public.venue_courts (id) ON DELETE CASCADE,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  booker_user_id UUID REFERENCES public.profiles (id) ON DELETE SET NULL,
  match_opportunity_id UUID REFERENCES public.match_opportunities (id) ON DELETE SET NULL,
  status public.venue_reservation_status NOT NULL DEFAULT 'confirmed',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT venue_reservations_time_order CHECK (ends_at > starts_at)
);

CREATE INDEX idx_venue_reservations_court_time ON public.venue_reservations (court_id, starts_at);
CREATE INDEX idx_venue_reservations_booker ON public.venue_reservations (booker_user_id);
CREATE INDEX idx_venue_reservations_match ON public.venue_reservations (match_opportunity_id);

ALTER TABLE public.match_opportunities
  ADD COLUMN IF NOT EXISTS venue_reservation_id UUID REFERENCES public.venue_reservations (id) ON DELETE SET NULL;

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
      AND r.status = 'confirmed'
      AND r.id IS DISTINCT FROM NEW.id
      AND r.starts_at < NEW.ends_at
      AND r.ends_at > NEW.starts_at
  ) THEN
    RAISE EXCEPTION 'venue_reservation_overlap' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_venue_reservations_overlap ON public.venue_reservations;
CREATE TRIGGER trg_venue_reservations_overlap
  BEFORE INSERT OR UPDATE ON public.venue_reservations
  FOR EACH ROW EXECUTE PROCEDURE public.venue_reservations_check_overlap();

CREATE OR REPLACE FUNCTION public.is_venue_owner(p_venue_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.sports_venues v
    WHERE v.id = p_venue_id
      AND v.owner_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.is_venue_owner(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_venue_owner(uuid) TO authenticated;

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
        AND r.status = 'confirmed'
        AND r.starts_at < p_ends_at
        AND r.ends_at > p_starts_at
    )
  ORDER BY c.sort_order, c.name, c.id
  LIMIT 1;

  IF v_court_id IS NULL THEN
    RAISE EXCEPTION 'no_court_available';
  END IF;

  INSERT INTO public.venue_reservations (court_id, starts_at, ends_at, booker_user_id, status)
  VALUES (v_court_id, p_starts_at, p_ends_at, auth.uid(), 'confirmed')
  RETURNING id INTO v_res_id;

  RETURN v_res_id;
END;
$$;

REVOKE ALL ON FUNCTION public.book_venue_slot(uuid, timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.book_venue_slot(uuid, timestamptz, timestamptz) TO authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.sports_venues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venue_courts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venue_weekly_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venue_reservations ENABLE ROW LEVEL SECURITY;

CREATE POLICY sports_venues_select_authenticated
  ON public.sports_venues FOR SELECT TO authenticated USING (true);

CREATE POLICY sports_venues_select_anon
  ON public.sports_venues FOR SELECT TO anon USING (true);

CREATE POLICY sports_venues_insert_venue_owner
  ON public.sports_venues FOR INSERT TO authenticated
  WITH CHECK (
    owner_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.account_type = 'venue'
    )
  );

CREATE POLICY sports_venues_update_owner
  ON public.sports_venues FOR UPDATE TO authenticated
  USING (public.is_venue_owner(id))
  WITH CHECK (public.is_venue_owner(id));

CREATE POLICY sports_venues_delete_owner
  ON public.sports_venues FOR DELETE TO authenticated
  USING (public.is_venue_owner(id));

CREATE POLICY venue_courts_select_authenticated
  ON public.venue_courts FOR SELECT TO authenticated USING (true);

CREATE POLICY venue_courts_select_anon
  ON public.venue_courts FOR SELECT TO anon USING (true);

CREATE POLICY venue_courts_write_owner
  ON public.venue_courts FOR ALL TO authenticated
  USING (public.is_venue_owner(venue_id))
  WITH CHECK (public.is_venue_owner(venue_id));

CREATE POLICY venue_weekly_hours_select_authenticated
  ON public.venue_weekly_hours FOR SELECT TO authenticated USING (true);

CREATE POLICY venue_weekly_hours_select_anon
  ON public.venue_weekly_hours FOR SELECT TO anon USING (true);

CREATE POLICY venue_weekly_hours_write_owner
  ON public.venue_weekly_hours FOR ALL TO authenticated
  USING (public.is_venue_owner(venue_id))
  WITH CHECK (public.is_venue_owner(venue_id));

CREATE POLICY venue_reservations_select
  ON public.venue_reservations FOR SELECT TO authenticated
  USING (
    booker_user_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.venue_courts c
      WHERE c.id = venue_reservations.court_id
        AND public.is_venue_owner(c.venue_id)
    )
  );

CREATE POLICY venue_reservations_update
  ON public.venue_reservations FOR UPDATE TO authenticated
  USING (
    booker_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.venue_courts c
      WHERE c.id = venue_reservations.court_id
        AND public.is_venue_owner(c.venue_id)
    )
  )
  WITH CHECK (true);

CREATE POLICY venue_reservations_delete_owner
  ON public.venue_reservations FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.venue_courts c
      WHERE c.id = venue_reservations.court_id
        AND public.is_venue_owner(c.venue_id)
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sports_venues TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.venue_courts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.venue_weekly_hours TO authenticated;
GRANT SELECT, UPDATE, DELETE ON public.venue_reservations TO authenticated;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.sports_venues;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.venue_reservations;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
