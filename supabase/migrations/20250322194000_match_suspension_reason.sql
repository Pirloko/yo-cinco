-- Suspensión/cancelación de partido con motivo

ALTER TABLE public.match_opportunities
  ADD COLUMN suspended_at TIMESTAMPTZ,
  ADD COLUMN suspended_reason TEXT;

ALTER TABLE public.match_opportunities
  ADD CONSTRAINT match_opportunities_suspended_reason_len
  CHECK (
    suspended_reason IS NULL
    OR (char_length(trim(suspended_reason)) >= 5 AND char_length(suspended_reason) <= 1000)
  );

COMMENT ON COLUMN public.match_opportunities.suspended_at IS 'Fecha de suspensión/cancelación del partido.';
COMMENT ON COLUMN public.match_opportunities.suspended_reason IS 'Motivo entregado por el organizador al suspender.';
