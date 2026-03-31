-- Marca cuándo el jugador confirmó datos esenciales (WhatsApp + género) en la app.
-- OAuth (Google) no envía estos datos: quedan NULL hasta completar onboarding.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS player_essentials_completed_at TIMESTAMPTZ;

COMMENT ON COLUMN public.profiles.player_essentials_completed_at IS
  'Fecha en que el jugador confirmó WhatsApp y género (registro email o onboarding).';

-- Usuarios existentes con WhatsApp guardado: considerarlos ya confirmados.
UPDATE public.profiles
SET player_essentials_completed_at = COALESCE(updated_at, created_at)
WHERE (account_type IS NULL OR account_type = 'player')
  AND btrim(coalesce(whatsapp_phone, '')) <> ''
  AND player_essentials_completed_at IS NULL;
