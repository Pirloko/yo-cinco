-- WhatsApp obligatorio para jugadores al crear cuenta.
-- Se agrega la columna en profiles y se actualiza el trigger de alta de auth.users
-- para tomar whatsapp_phone desde raw_user_meta_data.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS whatsapp_phone TEXT NOT NULL DEFAULT '';

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, name, whatsapp_phone)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'name', ''),
    COALESCE(NEW.raw_user_meta_data ->> 'whatsapp_phone', '')
  );
  RETURN NEW;
END;
$$;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_player_whatsapp_required;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_player_whatsapp_required
  CHECK (
    account_type IS DISTINCT FROM 'player'
    OR char_length(btrim(whatsapp_phone)) > 0
  ) NOT VALID;
