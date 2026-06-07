-- Reseña unificada post-partido: recinto, ambiente, nivel y MVP (todos los participantes confirmados + organizador).

ALTER TABLE public.match_opportunity_ratings
  ADD COLUMN IF NOT EXISTS venue_rating SMALLINT
    CHECK (venue_rating IS NULL OR (venue_rating >= 1 AND venue_rating <= 5)),
  ADD COLUMN IF NOT EXISTS mvp_user_id UUID REFERENCES public.profiles (id) ON DELETE SET NULL;

COMMENT ON COLUMN public.match_opportunity_ratings.venue_rating IS
  'Valoración del recinto deportivo (1-5). Reemplaza organizer_rating en reseñas nuevas.';
COMMENT ON COLUMN public.match_opportunity_ratings.mvp_user_id IS
  'Jugador elegido como MVP del partido por quien envía la reseña.';

CREATE OR REPLACE FUNCTION public._match_review_eligible_user(
  p_opportunity_id uuid,
  p_user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.match_opportunities mo
    WHERE mo.id = p_opportunity_id
      AND mo.creator_id = p_user_id
  )
  OR EXISTS (
    SELECT 1
    FROM public.match_opportunity_participants p
    WHERE p.opportunity_id = p_opportunity_id
      AND p.user_id = p_user_id
      AND p.status = 'confirmed'::public.participant_status
  );
$$;

CREATE OR REPLACE FUNCTION public.enforce_match_rating_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.match_opportunities
    WHERE public.match_opportunities.id = NEW.opportunity_id
  ) THEN
    RAISE EXCEPTION 'Oportunidad no existe';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.match_opportunities
    WHERE public.match_opportunities.id = NEW.opportunity_id
      AND public.match_opportunities.status = 'completed'::public.match_status
      AND public.match_opportunities.finalized_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Solo se puede calificar un partido finalizado';
  END IF;

  IF NOT public._match_review_eligible_user(NEW.opportunity_id, NEW.rater_id) THEN
    RAISE EXCEPTION 'Solo participantes confirmados u organizador pueden dejar reseña';
  END IF;

  IF NEW.venue_rating IS NULL
     OR NEW.match_rating IS NULL
     OR NEW.level_rating IS NULL
     OR NEW.mvp_user_id IS NULL THEN
    RAISE EXCEPTION 'Completa recinto, ambiente, nivel y MVP';
  END IF;

  IF NOT public._match_review_eligible_user(NEW.opportunity_id, NEW.mvp_user_id) THEN
    RAISE EXCEPTION 'El MVP debe ser un participante del partido';
  END IF;

  RETURN NEW;
END;
$$;

DROP POLICY IF EXISTS mor_insert_self_eligible ON public.match_opportunity_ratings;

CREATE POLICY mor_insert_self_eligible
  ON public.match_opportunity_ratings
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = rater_id
    AND EXISTS (
      SELECT 1
      FROM public.match_opportunities
      WHERE public.match_opportunities.id = opportunity_id
        AND public.match_opportunities.status = 'completed'::public.match_status
        AND public.match_opportunities.finalized_at IS NOT NULL
        AND public._match_review_eligible_user(
          public.match_opportunities.id,
          auth.uid()
        )
    )
  );

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
            mor.venue_rating,
            mor.match_rating,
            mor.level_rating,
            mor.mvp_user_id
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
            mor.venue_rating,
            mor.match_rating,
            mor.level_rating,
            mor.mvp_user_id
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
          mor.venue_rating,
          mor.match_rating,
          mor.level_rating,
          mor.mvp_user_id,
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
