-- Calificaciones: sin límite de 48 h tras finalized_at.
-- Política INSERT alineada con el trigger (sin ventana temporal).
-- Función solo con SQL en subconsultas (sin DECLARE) para evitar errores de parseo en el SQL Editor.

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

  IF NOT EXISTS (
    SELECT 1
    FROM public.match_opportunities
    WHERE public.match_opportunities.id = NEW.opportunity_id
      AND public.match_opportunities.creator_id = NEW.rater_id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.match_opportunity_participants
    WHERE match_opportunity_participants.opportunity_id = NEW.opportunity_id
      AND match_opportunity_participants.user_id = NEW.rater_id
      AND match_opportunity_participants.status = 'confirmed'
  ) THEN
    RAISE EXCEPTION 'Solo el organizador o participantes confirmados pueden calificar';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.match_opportunities
    WHERE public.match_opportunities.id = NEW.opportunity_id
      AND public.match_opportunities.creator_id = NEW.rater_id
  ) THEN
    IF NEW.organizer_rating IS NOT NULL THEN
      RAISE EXCEPTION 'El organizador no califica la gestión (solo el partido en conjunto)';
    END IF;
  ELSE
    IF NEW.organizer_rating IS NULL THEN
      RAISE EXCEPTION 'Debes calificar la gestión del organizador';
    END IF;
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
        AND (
          public.match_opportunities.creator_id = auth.uid()
          OR EXISTS (
            SELECT 1
            FROM public.match_opportunity_participants
            WHERE match_opportunity_participants.opportunity_id =
              public.match_opportunities.id
              AND match_opportunity_participants.user_id = auth.uid()
              AND match_opportunity_participants.status = 'confirmed'
          )
        )
    )
  );
