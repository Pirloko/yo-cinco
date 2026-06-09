-- Ventana de reseñas post-partido: 24 h desde finalized_at (MVP + valoraciones).

CREATE OR REPLACE FUNCTION public.enforce_match_rating_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  mo public.match_opportunities%ROWTYPE;
BEGIN
  SELECT * INTO mo FROM public.match_opportunities WHERE id = NEW.opportunity_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Oportunidad no existe';
  END IF;

  IF mo.status IS DISTINCT FROM 'completed'::public.match_status OR mo.finalized_at IS NULL THEN
    RAISE EXCEPTION 'Solo se puede calificar un partido finalizado';
  END IF;

  IF now() > mo.finalized_at + interval '24 hours' THEN
    RAISE EXCEPTION 'Plazo de reseña vencido (24 h)';
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

  IF NEW.mvp_user_id = NEW.rater_id THEN
    RAISE EXCEPTION 'No puedes elegirte a ti mismo como MVP';
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
      FROM public.match_opportunities mo
      WHERE mo.id = opportunity_id
        AND mo.status = 'completed'::public.match_status
        AND mo.finalized_at IS NOT NULL
        AND now() <= mo.finalized_at + interval '24 hours'
        AND public._match_review_eligible_user(mo.id, auth.uid())
    )
  );

COMMENT ON FUNCTION public.enforce_match_rating_rules() IS
  'Valida reseña unificada post-partido: ventana 24 h desde finalized_at, MVP obligatorio sin auto-voto.';
