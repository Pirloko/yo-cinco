-- Ocultar centros en exploración pública sin borrarlos (panel admin: pausar / reactivar).

ALTER TABLE public.sports_venues
  ADD COLUMN IF NOT EXISTS is_paused BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.sports_venues.is_paused IS
  'Si true, el centro no se lista en exploración ni páginas públicas de jugadores.';
