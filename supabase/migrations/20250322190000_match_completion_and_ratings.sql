-- Finalización de partido por el organizador + calificaciones (ventana 48 h tras finalized_at)

CREATE TYPE public.rival_result AS ENUM ('creator_team', 'rival_team', 'draw');

ALTER TABLE public.match_opportunities
  ADD COLUMN finalized_at TIMESTAMPTZ,
  ADD COLUMN rival_result public.rival_result,
  ADD COLUMN casual_completed BOOLEAN;

COMMENT ON COLUMN public.match_opportunities.finalized_at IS 'Momento en que el organizador marcó el partido como jugado/cerrado.';
COMMENT ON COLUMN public.match_opportunities.rival_result IS 'Solo type=rival: quién ganó o empate.';
COMMENT ON COLUMN public.match_opportunities.casual_completed IS 'type=players|open: partido jugado (sin marcador de equipos).';

-- ---------------------------------------------------------------------------
-- Calificaciones: una fila por (oportunidad, quien califica)
-- El organizador no califica "al organizador" (organizer_rating NULL).
-- ---------------------------------------------------------------------------
CREATE TABLE public.match_opportunity_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id UUID NOT NULL REFERENCES public.match_opportunities (id) ON DELETE CASCADE,
  rater_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  organizer_rating SMALLINT CHECK (organizer_rating IS NULL OR (organizer_rating >= 1 AND organizer_rating <= 5)),
  match_rating SMALLINT NOT NULL CHECK (match_rating >= 1 AND match_rating <= 5),
  level_rating SMALLINT NOT NULL CHECK (level_rating >= 1 AND level_rating <= 5),
  comment TEXT CHECK (comment IS NULL OR char_length(comment) <= 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (opportunity_id, rater_id)
);

CREATE INDEX idx_mor_opportunity ON public.match_opportunity_ratings (opportunity_id);
CREATE INDEX idx_mor_rater ON public.match_opportunity_ratings (rater_id);

CREATE OR REPLACE FUNCTION public.enforce_match_rating_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cid UUID;
  mo RECORD;
BEGIN
  SELECT * INTO mo FROM public.match_opportunities WHERE id = NEW.opportunity_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Oportunidad no existe';
  END IF;
  IF mo.status IS DISTINCT FROM 'completed'::public.match_status OR mo.finalized_at IS NULL THEN
    RAISE EXCEPTION 'Solo se puede calificar un partido finalizado';
  END IF;
  IF now() > mo.finalized_at + interval '48 hours' THEN
    RAISE EXCEPTION 'Plazo de calificación vencido (48 h)';
  END IF;
  cid := mo.creator_id;
  IF NEW.rater_id IS DISTINCT FROM cid THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.match_opportunity_participants p
      WHERE p.opportunity_id = NEW.opportunity_id
        AND p.user_id = NEW.rater_id
        AND p.status = 'confirmed'
    ) THEN
      RAISE EXCEPTION 'Solo el organizador o participantes confirmados pueden calificar';
    END IF;
  END IF;

  IF NEW.rater_id = cid THEN
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

CREATE TRIGGER trg_match_rating_rules
  BEFORE INSERT ON public.match_opportunity_ratings
  FOR EACH ROW EXECUTE PROCEDURE public.enforce_match_rating_rules();

ALTER PUBLICATION supabase_realtime ADD TABLE public.match_opportunity_ratings;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.match_opportunity_ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY mor_select_participants
  ON public.match_opportunity_ratings
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.match_opportunities mo
      WHERE mo.id = opportunity_id
        AND (
          mo.creator_id = auth.uid()
          OR EXISTS (
            SELECT 1
            FROM public.match_opportunity_participants p
            WHERE p.opportunity_id = mo.id
              AND p.user_id = auth.uid()
              AND p.status = 'confirmed'
          )
        )
    )
  );

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
        AND now() <= mo.finalized_at + interval '48 hours'
        AND (
          mo.creator_id = auth.uid()
          OR EXISTS (
            SELECT 1
            FROM public.match_opportunity_participants p
            WHERE p.opportunity_id = mo.id
              AND p.user_id = auth.uid()
              AND p.status = 'confirmed'
          )
        )
    )
  );
