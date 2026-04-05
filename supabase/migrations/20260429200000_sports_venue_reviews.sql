-- Reseñas de jugadores a centros deportivos (solo reservas cancha sin partido).

CREATE TABLE public.sports_venue_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.sports_venues (id) ON DELETE CASCADE,
  venue_reservation_id UUID NOT NULL REFERENCES public.venue_reservations (id) ON DELETE CASCADE,
  reviewer_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  court_quality SMALLINT NOT NULL CHECK (court_quality >= 1 AND court_quality <= 5),
  management_rating SMALLINT NOT NULL CHECK (management_rating >= 1 AND management_rating <= 5),
  facilities_rating SMALLINT NOT NULL CHECK (facilities_rating >= 1 AND facilities_rating <= 5),
  comment TEXT,
  reviewer_name_snapshot TEXT NOT NULL CHECK (
    char_length(trim(reviewer_name_snapshot)) >= 1
    AND char_length(reviewer_name_snapshot) <= 80
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT sports_venue_reviews_one_per_reservation UNIQUE (venue_reservation_id)
);

CREATE INDEX idx_sports_venue_reviews_venue ON public.sports_venue_reviews (venue_id);
CREATE INDEX idx_sports_venue_reviews_created ON public.sports_venue_reviews (venue_id, created_at DESC);

COMMENT ON TABLE public.sports_venue_reviews IS
  'Opiniones de jugadores tras reservar solo cancha; una fila por reserva.';

-- Agregados para ficha pública (lectura anon).
CREATE OR REPLACE VIEW public.sports_venue_review_stats AS
SELECT
  venue_id,
  count(*)::integer AS review_count,
  round(avg(court_quality)::numeric, 1) AS avg_court_quality,
  round(avg(management_rating)::numeric, 1) AS avg_management,
  round(avg(facilities_rating)::numeric, 1) AS avg_facilities,
  round(
    (
      avg(court_quality) + avg(management_rating) + avg(facilities_rating)
    )::numeric / 3,
    1
  ) AS avg_overall
FROM public.sports_venue_reviews
GROUP BY venue_id;

ALTER TABLE public.sports_venue_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY sports_venue_reviews_select_public
  ON public.sports_venue_reviews
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY sports_venue_reviews_insert_booker
  ON public.sports_venue_reviews
  FOR INSERT
  TO authenticated
  WITH CHECK (
    reviewer_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.venue_reservations vr
      INNER JOIN public.venue_courts vc ON vc.id = vr.court_id
      WHERE vr.id = sports_venue_reviews.venue_reservation_id
        AND vr.booker_user_id = auth.uid()
        AND vr.match_opportunity_id IS NULL
        AND vr.status = 'confirmed'
        AND vc.venue_id = sports_venue_reviews.venue_id
        AND vr.ends_at < now()
    )
  );

GRANT SELECT ON public.sports_venue_reviews TO anon, authenticated;
GRANT INSERT ON public.sports_venue_reviews TO authenticated;
GRANT SELECT ON public.sports_venue_review_stats TO anon, authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'sports_venue_reviews'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.sports_venue_reviews;
  END IF;
END $$;
