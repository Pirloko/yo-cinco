-- Amarillas y rojas: contadores históricos acumulativos (nunca se reducen a 0).
-- Cada 3ª amarilla acumulada sigue generando +1 roja y suspensión 3 días, sin borrar amarillas.

COMMENT ON COLUMN public.profiles.mod_yellow_cards IS
  'Tarjetas amarillas acumuladas (moderación). Histórico: solo aumenta.';
COMMENT ON COLUMN public.profiles.mod_red_cards IS
  'Tarjetas rojas acumuladas (moderación). Histórico: solo aumenta.';

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
  y_after int;
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

    SELECT mod_yellow_cards INTO y_after FROM public.profiles WHERE id = p_user_id;
    -- Cada múltiplo de 3 amarillas: +1 roja y suspensión (sin resetear amarillas).
    IF y_after > 0 AND y_after % 3 = 0 THEN
      next_suspend := now() + interval '3 days';
      UPDATE public.profiles
      SET mod_red_cards = mod_red_cards + 1,
          mod_suspended_until = GREATEST(COALESCE(mod_suspended_until, now()), next_suspend),
          mod_last_red_at = now()
      WHERE id = p_user_id;
    END IF;
    RETURN;
  ELSIF lower(p_card) = 'red' THEN
    next_suspend := now() + interval '3 days';
    UPDATE public.profiles
    SET mod_red_cards = mod_red_cards + 1,
        mod_suspended_until = GREATEST(COALESCE(mod_suspended_until, now()), next_suspend),
        mod_last_red_at = now()
    WHERE id = p_user_id;
    RETURN;
  ELSE
    RAISE EXCEPTION 'invalid_card';
  END IF;
END;
$$;
