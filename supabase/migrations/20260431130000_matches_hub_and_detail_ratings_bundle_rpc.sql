-- Fase 4: un solo round-trip PostgREST para datos del hub de partidos y para el bloque de reseñas en detalle.
-- SECURITY INVOKER: aplica RLS de messages, match_opportunity_ratings y sports_venue_reviews.

CREATE OR REPLACE FUNCTION public.matches_hub_secondary_bundle(
  p_finished_opp_ids uuid[],
  p_chat_opp_ids uuid[],
  p_reservation_ids uuid[]
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'rating_rows',
    COALESCE(
      (
        SELECT jsonb_agg(to_jsonb(t))
        FROM (
          SELECT
            mor.opportunity_id,
            mor.organizer_rating,
            mor.match_rating,
            mor.level_rating
          FROM public.match_opportunity_ratings mor
          WHERE mor.opportunity_id = ANY (COALESCE(p_finished_opp_ids, '{}'::uuid[]))
        ) t
      ),
      '[]'::jsonb
    ),
    'last_messages',
    COALESCE(
      (
        SELECT jsonb_agg(to_jsonb(t))
        FROM (
          SELECT DISTINCT ON (m.opportunity_id)
            m.opportunity_id,
            m.content,
            m.created_at
          FROM public.messages m
          WHERE m.opportunity_id = ANY (COALESCE(p_chat_opp_ids, '{}'::uuid[]))
          ORDER BY m.opportunity_id, m.created_at DESC
        ) t
      ),
      '[]'::jsonb
    ),
    'venue_reviews',
    COALESCE(
      (
        SELECT jsonb_agg(to_jsonb(t))
        FROM (
          SELECT
            r.venue_reservation_id,
            r.court_quality,
            r.management_rating,
            r.facilities_rating,
            r.comment
          FROM public.sports_venue_reviews r
          WHERE r.venue_reservation_id = ANY (COALESCE(p_reservation_ids, '{}'::uuid[]))
        ) t
      ),
      '[]'::jsonb
    )
  );
$$;

COMMENT ON FUNCTION public.matches_hub_secondary_bundle(uuid[], uuid[], uuid[]) IS
  'Hub Partidos: ratings por oportunidad, último mensaje por chat y reseñas de reservas solo (Fase 4).';

CREATE OR REPLACE FUNCTION public.match_detail_ratings_bundle(p_opportunity_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'rating_rows',
    COALESCE(
      (
        SELECT jsonb_agg(to_jsonb(t))
        FROM (
          SELECT
            mor.opportunity_id,
            mor.organizer_rating,
            mor.match_rating,
            mor.level_rating
          FROM public.match_opportunity_ratings mor
          WHERE mor.opportunity_id = p_opportunity_id
        ) t
      ),
      '[]'::jsonb
    ),
    'comments',
    COALESCE(
      (
        SELECT jsonb_agg(to_jsonb(t))
        FROM (
          SELECT mor.comment, mor.created_at
          FROM public.match_opportunity_ratings mor
          WHERE mor.opportunity_id = p_opportunity_id
            AND mor.comment IS NOT NULL
            AND trim(mor.comment) <> ''
          ORDER BY mor.created_at DESC
          LIMIT 4
        ) t
      ),
      '[]'::jsonb
    ),
    'my_rating',
    (
      SELECT to_jsonb(t)
      FROM (
        SELECT
          mor.id,
          mor.opportunity_id,
          mor.rater_id,
          mor.organizer_rating,
          mor.match_rating,
          mor.level_rating,
          mor.comment,
          mor.created_at
        FROM public.match_opportunity_ratings mor
        WHERE mor.opportunity_id = p_opportunity_id
          AND mor.rater_id = auth.uid()
        LIMIT 1
      ) t
    )
  );
$$;

COMMENT ON FUNCTION public.match_detail_ratings_bundle(uuid) IS
  'Detalle partido: filas de reseñas, comentarios recientes y mi reseña (Fase 4).';

GRANT EXECUTE ON FUNCTION public.matches_hub_secondary_bundle(uuid[], uuid[], uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.match_detail_ratings_bundle(uuid) TO authenticated;
