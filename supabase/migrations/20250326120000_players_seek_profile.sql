-- Búsqueda de jugadores: qué tipo de cupos ofrece el organizador
ALTER TABLE public.match_opportunities
  ADD COLUMN IF NOT EXISTS players_seek_profile TEXT;

ALTER TABLE public.match_opportunities
  DROP CONSTRAINT IF EXISTS match_opportunities_players_seek_profile_check;

ALTER TABLE public.match_opportunities
  ADD CONSTRAINT match_opportunities_players_seek_profile_check
  CHECK (
    players_seek_profile IS NULL
    OR players_seek_profile IN ('gk_only', 'field_only', 'gk_and_field')
  );
