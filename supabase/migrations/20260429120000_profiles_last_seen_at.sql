-- Presencia aproximada: el cliente envía heartbeat (API) y se actualiza last_seen_at.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;

COMMENT ON COLUMN public.profiles.last_seen_at IS
  'Última actividad reportada por el cliente (heartbeat). Usado para "en línea" en admin.';

CREATE INDEX IF NOT EXISTS idx_profiles_last_seen_at_recent
  ON public.profiles (last_seen_at DESC)
  WHERE last_seen_at IS NOT NULL;
