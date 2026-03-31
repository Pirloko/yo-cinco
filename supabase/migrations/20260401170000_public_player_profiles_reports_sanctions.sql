-- Perfil público de jugador (sin WhatsApp), reportes y sanciones (tarjetas).

-- ---------------------------------------------------------------------------
-- Perfiles: columnas de moderación/sanciones
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS mod_yellow_cards INTEGER NOT NULL DEFAULT 0 CHECK (mod_yellow_cards >= 0),
  ADD COLUMN IF NOT EXISTS mod_red_cards INTEGER NOT NULL DEFAULT 0 CHECK (mod_red_cards >= 0),
  ADD COLUMN IF NOT EXISTS mod_suspended_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS mod_banned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS mod_ban_reason TEXT;

COMMENT ON COLUMN public.profiles.mod_yellow_cards IS 'Tarjetas amarillas acumuladas (moderación).';
COMMENT ON COLUMN public.profiles.mod_red_cards IS 'Tarjetas rojas acumuladas (moderación).';
COMMENT ON COLUMN public.profiles.mod_suspended_until IS 'Si > now(), el usuario queda en modo solo lectura.';
COMMENT ON COLUMN public.profiles.mod_banned_at IS 'Baneo permanente (si no NULL).';
COMMENT ON COLUMN public.profiles.mod_ban_reason IS 'Motivo del baneo.';

-- ---------------------------------------------------------------------------
-- RPC: Perfil público de jugador (campos permitidos; nunca WhatsApp/email)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fetch_public_player_profile(p_user_id uuid)
RETURNS TABLE (
  id uuid,
  name text,
  photo_url text,
  city text,
  city_id uuid,
  level public.skill_level,
  "position" public.position,
  availability text[],
  stats_player_wins integer,
  stats_player_draws integer,
  stats_player_losses integer,
  stats_organized_completed integer,
  stats_organizer_wins integer,
  mod_yellow_cards integer,
  mod_red_cards integer,
  mod_suspended_until timestamptz,
  mod_banned_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id,
    p.name,
    p.photo_url,
    COALESCE(gc.name, p.city) AS city,
    p.city_id,
    p.level,
    p.position AS "position",
    p.availability,
    p.stats_player_wins,
    p.stats_player_draws,
    p.stats_player_losses,
    p.stats_organized_completed,
    p.stats_organizer_wins,
    p.mod_yellow_cards,
    p.mod_red_cards,
    p.mod_suspended_until,
    p.mod_banned_at
  FROM public.profiles p
  LEFT JOIN public.geo_cities gc ON gc.id = p.city_id
  WHERE p.id = p_user_id
    AND p.account_type = 'player'::public.account_type;
$$;

REVOKE ALL ON FUNCTION public.fetch_public_player_profile(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fetch_public_player_profile(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Reportes de jugador (moderación)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'player_report_status') THEN
    CREATE TYPE public.player_report_status AS ENUM ('pending', 'reviewed', 'dismissed', 'action_taken');
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS public.player_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  reported_user_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  context_type TEXT NOT NULL, -- match/chat/team/message/etc (solo referencia)
  context_id UUID, -- id del recurso si aplica
  reason TEXT NOT NULL,
  details TEXT,
  status public.player_report_status NOT NULL DEFAULT 'pending',
  reviewed_by UUID REFERENCES public.profiles (id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  resolution TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_player_reports_reported ON public.player_reports (reported_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_player_reports_status ON public.player_reports (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_player_reports_reporter ON public.player_reports (reporter_id, created_at DESC);

ALTER TABLE public.player_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS player_reports_insert_authenticated ON public.player_reports;
CREATE POLICY player_reports_insert_authenticated
  ON public.player_reports
  FOR INSERT
  TO authenticated
  WITH CHECK (reporter_id = auth.uid());

DROP POLICY IF EXISTS player_reports_select_admin ON public.player_reports;
CREATE POLICY player_reports_select_admin
  ON public.player_reports
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS player_reports_update_admin ON public.player_reports;
CREATE POLICY player_reports_update_admin
  ON public.player_reports
  FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ---------------------------------------------------------------------------
-- RPC admin: aplicar tarjeta/sanción (amarilla/roja) y suspender/baneo
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_apply_card(
  p_user_id uuid,
  p_card text, -- 'yellow' | 'red'
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
    SET mod_yellow_cards = mod_yellow_cards + 1
    WHERE id = p_user_id;

    SELECT mod_yellow_cards INTO prof.mod_yellow_cards FROM public.profiles WHERE id = p_user_id;
    IF prof.mod_yellow_cards >= 3 THEN
      next_suspend := now() + interval '3 days';
      UPDATE public.profiles
      SET mod_yellow_cards = 0,
          mod_red_cards = mod_red_cards + 1,
          mod_suspended_until = GREATEST(COALESCE(mod_suspended_until, now()), next_suspend)
      WHERE id = p_user_id;
    END IF;
    RETURN;
  ELSIF lower(p_card) = 'red' THEN
    next_suspend := now() + interval '3 days';
    UPDATE public.profiles
    SET mod_red_cards = mod_red_cards + 1,
        mod_yellow_cards = 0,
        mod_suspended_until = GREATEST(COALESCE(mod_suspended_until, now()), next_suspend)
    WHERE id = p_user_id;
    RETURN;
  ELSE
    RAISE EXCEPTION 'invalid_card';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_apply_card(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_apply_card(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_ban_user(
  p_user_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not_admin';
  END IF;
  UPDATE public.profiles
  SET mod_banned_at = COALESCE(mod_banned_at, now()),
      mod_ban_reason = COALESCE(NULLIF(p_reason, ''), mod_ban_reason)
  WHERE id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_ban_user(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_ban_user(uuid, text) TO authenticated;

