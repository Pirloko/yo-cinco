-- Timestamps de última tarjeta (alertas 24h en perfil del jugador).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS mod_last_yellow_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS mod_last_red_at TIMESTAMPTZ;

COMMENT ON COLUMN public.profiles.mod_last_yellow_at IS 'Última aplicación de tarjeta amarilla (aviso temporal en app).';
COMMENT ON COLUMN public.profiles.mod_last_red_at IS 'Última aplicación de tarjeta roja (aviso temporal en app).';

CREATE OR REPLACE FUNCTION public.admin_apply_card(
  p_user_id uuid,
  p_card text,
  p_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  prof RECORD;
  next_suspend timestamptz;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not_admin';
  END IF;

  SELECT id, mod_yellow_cards, mod_red_cards, mod_suspended_until, mod_banned_at
    INTO prof
  FROM public.profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'user_not_found';
  END IF;

  IF prof.mod_banned_at IS NOT NULL THEN
    RETURN;
  END IF;

  IF lower(p_card) = 'yellow' THEN
    UPDATE public.profiles
    SET mod_yellow_cards = mod_yellow_cards + 1,
        mod_last_yellow_at = now()
    WHERE id = p_user_id;

    SELECT mod_yellow_cards INTO prof.mod_yellow_cards FROM public.profiles WHERE id = p_user_id;
    IF prof.mod_yellow_cards >= 3 THEN
      next_suspend := now() + interval '3 days';
      UPDATE public.profiles
      SET mod_yellow_cards = 0,
          mod_red_cards = mod_red_cards + 1,
          mod_suspended_until = GREATEST(COALESCE(mod_suspended_until, now()), next_suspend),
          mod_last_red_at = now()
      WHERE id = p_user_id;
    END IF;
    RETURN;
  ELSIF lower(p_card) = 'red' THEN
    next_suspend := now() + interval '3 days';
    UPDATE public.profiles
    SET mod_red_cards = mod_red_cards + 1,
        mod_yellow_cards = 0,
        mod_suspended_until = GREATEST(COALESCE(mod_suspended_until, now()), next_suspend),
        mod_last_red_at = now()
    WHERE id = p_user_id;
    RETURN;
  ELSE
    RAISE EXCEPTION 'invalid_card';
  END IF;
END;
$$;
