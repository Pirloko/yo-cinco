-- Admin global + autoconfirmación guiada por organizador/booker.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'account_type'
      AND e.enumlabel = 'admin'
  ) THEN
    ALTER TYPE public.account_type ADD VALUE 'admin';
  END IF;
END
$$;

ALTER TABLE public.venue_reservations
  ADD COLUMN IF NOT EXISTS confirmed_by_user_id UUID REFERENCES public.profiles (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS confirmation_source TEXT,
  ADD COLUMN IF NOT EXISTS confirmation_note TEXT;

ALTER TABLE public.venue_reservations
  DROP CONSTRAINT IF EXISTS venue_reservations_confirmation_source_check;

ALTER TABLE public.venue_reservations
  ADD CONSTRAINT venue_reservations_confirmation_source_check
  CHECK (
    confirmation_source IS NULL
    OR confirmation_source IN ('venue_owner', 'booker_self', 'admin')
  );

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.account_type::text = 'admin'
  );
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

DROP POLICY IF EXISTS venue_reservations_select_admin ON public.venue_reservations;
CREATE POLICY venue_reservations_select_admin
  ON public.venue_reservations
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS venue_reservations_update_admin ON public.venue_reservations;
CREATE POLICY venue_reservations_update_admin
  ON public.venue_reservations
  FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
