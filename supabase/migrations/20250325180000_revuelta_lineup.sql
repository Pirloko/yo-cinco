-- Sorteo de equipos A/B en revueltas (organizador, cupos completos).
ALTER TABLE public.match_opportunities
  ADD COLUMN IF NOT EXISTS revuelta_lineup JSONB DEFAULT NULL;

COMMENT ON COLUMN public.match_opportunities.revuelta_lineup IS
  'JSON: { teamA: { userIds: uuid[], colorHex: string }, teamB: { ... }, createdAt: iso }';
