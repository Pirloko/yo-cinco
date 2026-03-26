-- Permite crear usuarios desde Supabase Authentication sin exigir
-- whatsapp_phone en el alta técnica del perfil (trigger handle_new_user).
-- El WhatsApp puede seguir pidiéndose en la app para cuentas jugador.

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_player_whatsapp_required;
