-- Modo "selección de equipos" (6vs6): tipos nuevos, join_code privado, alineación por encuentro.
-- Bloque 1: esquema, triggers de cupos, RLS para partidos privados, RPC de creación.

-- ---------------------------------------------------------------------------
-- 1) Enum match_type: team_pick_public | team_pick_private
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'match_type' AND e.enumlabel = 'team_pick_public'
  ) THEN
    ALTER TYPE public.match_type ADD VALUE 'team_pick_public';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'match_type' AND e.enumlabel = 'team_pick_private'
  ) THEN
    ALTER TYPE public.match_type ADD VALUE 'team_pick_private';
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 2) match_opportunities: código 4 dígitos (obligatorio solo en team_pick_private)
-- ---------------------------------------------------------------------------
ALTER TABLE public.match_opportunities
  ADD COLUMN IF NOT EXISTS join_code text;

COMMENT ON COLUMN public.match_opportunities.join_code IS
  'Código 4 dígitos para unirse a partidos team_pick_private; NULL en público.';

ALTER TABLE public.match_opportunities
  DROP CONSTRAINT IF EXISTS match_opportunities_join_code_format;
ALTER TABLE public.match_opportunities
  ADD CONSTRAINT match_opportunities_join_code_format
  CHECK (join_code IS NULL OR join_code ~ '^[0-9]{4}$');

ALTER TABLE public.match_opportunities
  DROP CONSTRAINT IF EXISTS match_opportunities_team_pick_private_join_code;
ALTER TABLE public.match_opportunities
  ADD CONSTRAINT match_opportunities_team_pick_private_join_code
  CHECK (
    type IS DISTINCT FROM 'team_pick_private'::public.match_type
    OR (join_code IS NOT NULL AND char_length(join_code) = 4)
  );

ALTER TABLE public.match_opportunities
  DROP CONSTRAINT IF EXISTS match_opportunities_team_pick_public_no_code;
ALTER TABLE public.match_opportunities
  ADD CONSTRAINT match_opportunities_team_pick_public_no_code
  CHECK (
    type IS DISTINCT FROM 'team_pick_public'::public.match_type
    OR join_code IS NULL
  );

ALTER TABLE public.match_opportunities
  DROP CONSTRAINT IF EXISTS match_opportunities_team_pick_players_needed;
ALTER TABLE public.match_opportunities
  ADD CONSTRAINT match_opportunities_team_pick_players_needed
  CHECK (
    type NOT IN ('team_pick_public'::public.match_type, 'team_pick_private'::public.match_type)
    OR (players_needed = 12)
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_match_opportunities_join_code_active_private
  ON public.match_opportunities (join_code)
  WHERE type = 'team_pick_private'::public.match_type
    AND status IN ('pending', 'confirmed')
    AND join_code IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3) Participantes: bando (A/B) y rol del encuentro (gk / líneas)
-- ---------------------------------------------------------------------------
ALTER TABLE public.match_opportunity_participants
  ADD COLUMN IF NOT EXISTS pick_team char(1),
  ADD COLUMN IF NOT EXISTS encounter_lineup_role text;

COMMENT ON COLUMN public.match_opportunity_participants.pick_team IS
  'Equipo A o B solo para modos team_pick_*; NULL en otros tipos.';
COMMENT ON COLUMN public.match_opportunity_participants.encounter_lineup_role IS
  'Rol en este partido: gk, defensa, mediocampista, delantero (team_pick_*).';

ALTER TABLE public.match_opportunity_participants
  DROP CONSTRAINT IF EXISTS mop_pick_team_values;
ALTER TABLE public.match_opportunity_participants
  ADD CONSTRAINT mop_pick_team_values
  CHECK (pick_team IS NULL OR pick_team IN ('A', 'B'));

ALTER TABLE public.match_opportunity_participants
  DROP CONSTRAINT IF EXISTS mop_encounter_lineup_role_values;
ALTER TABLE public.match_opportunity_participants
  ADD CONSTRAINT mop_encounter_lineup_role_values
  CHECK (
    encounter_lineup_role IS NULL
    OR encounter_lineup_role IN ('gk', 'defensa', 'mediocampista', 'delantero')
  );

-- ---------------------------------------------------------------------------
-- 4) Arqueros en revuelta open: no bloquear team_pick_* (cupos en otro trigger)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_open_revuelta_goalkeeper_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  mo_type public.match_type;
  cnt int;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  SELECT type INTO mo_type
  FROM public.match_opportunities
  WHERE id = NEW.opportunity_id;

  IF mo_type IS NULL THEN
    RETURN NEW;
  END IF;

  IF mo_type IN ('team_pick_public'::public.match_type, 'team_pick_private'::public.match_type) THEN
    RETURN NEW;
  END IF;

  IF mo_type IS DISTINCT FROM 'open' THEN
    IF NEW.is_goalkeeper THEN
      RAISE EXCEPTION 'El rol arquero solo aplica en revueltas (tipo open)';
    END IF;
    RETURN NEW;
  END IF;

  IF NOT COALESCE(NEW.is_goalkeeper, false) THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*)::int INTO cnt
  FROM public.match_opportunity_participants
  WHERE opportunity_id = NEW.opportunity_id
    AND is_goalkeeper = true
    AND user_id IS DISTINCT FROM NEW.user_id;

  IF cnt >= 2 THEN
    RAISE EXCEPTION 'Ya hay 2 arqueros en esta revuelta';
  END IF;

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 5) Sincronizar is_goalkeeper desde encounter_lineup_role (team_pick)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_encounter_lineup_goalkeeper_flag()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  mo_type public.match_type;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  SELECT type INTO mo_type
  FROM public.match_opportunities
  WHERE id = NEW.opportunity_id;

  IF mo_type IS NULL
    OR mo_type NOT IN (
      'team_pick_public'::public.match_type,
      'team_pick_private'::public.match_type
    )
  THEN
    RETURN NEW;
  END IF;

  NEW.is_goalkeeper := NEW.encounter_lineup_role = 'gk';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mop_sync_encounter_gk ON public.match_opportunity_participants;
CREATE TRIGGER trg_mop_sync_encounter_gk
  BEFORE INSERT OR UPDATE
  ON public.match_opportunity_participants
  FOR EACH ROW
  EXECUTE PROCEDURE public.sync_encounter_lineup_goalkeeper_flag();

-- ---------------------------------------------------------------------------
-- 6) Cupos 6vs6 por bando (1 GK + 5 campo)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_team_pick_lineup_slots()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  mo_type public.match_type;
  a_tot int;
  a_gk int;
  a_fd int;
  b_tot int;
  b_gk int;
  b_fd int;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  SELECT type INTO mo_type
  FROM public.match_opportunities
  WHERE id = NEW.opportunity_id;

  IF mo_type IS NULL
    OR mo_type NOT IN (
      'team_pick_public'::public.match_type,
      'team_pick_private'::public.match_type
    )
  THEN
    RETURN NEW;
  END IF;

  IF NEW.status NOT IN ('pending', 'confirmed') THEN
    RETURN NEW;
  END IF;

  IF NEW.pick_team IS NULL OR NEW.pick_team NOT IN ('A', 'B') THEN
    RAISE EXCEPTION 'Debes elegir equipo A o B' USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.encounter_lineup_role IS NULL
    OR NEW.encounter_lineup_role NOT IN ('gk', 'defensa', 'mediocampista', 'delantero')
  THEN
    RAISE EXCEPTION 'Debes elegir rol para este encuentro' USING ERRCODE = 'check_violation';
  END IF;

  SELECT
    COUNT(*) FILTER (WHERE pick_team = 'A'),
    COUNT(*) FILTER (WHERE pick_team = 'A' AND encounter_lineup_role = 'gk'),
    COUNT(*) FILTER (WHERE pick_team = 'A' AND encounter_lineup_role IS DISTINCT FROM 'gk'),
    COUNT(*) FILTER (WHERE pick_team = 'B'),
    COUNT(*) FILTER (WHERE pick_team = 'B' AND encounter_lineup_role = 'gk'),
    COUNT(*) FILTER (WHERE pick_team = 'B' AND encounter_lineup_role IS DISTINCT FROM 'gk')
  INTO a_tot, a_gk, a_fd, b_tot, b_gk, b_fd
  FROM public.match_opportunity_participants
  WHERE opportunity_id = NEW.opportunity_id
    AND status IN ('pending', 'confirmed')
    AND user_id IS DISTINCT FROM NEW.user_id;

  IF NEW.pick_team = 'A' THEN
    a_tot := a_tot + 1;
    IF NEW.encounter_lineup_role = 'gk' THEN
      a_gk := a_gk + 1;
    ELSE
      a_fd := a_fd + 1;
    END IF;
  ELSE
    b_tot := b_tot + 1;
    IF NEW.encounter_lineup_role = 'gk' THEN
      b_gk := b_gk + 1;
    ELSE
      b_fd := b_fd + 1;
    END IF;
  END IF;

  IF a_gk > 1 OR b_gk > 1 THEN
    RAISE EXCEPTION 'Solo puede haber 1 arquero por equipo' USING ERRCODE = 'check_violation';
  END IF;
  IF a_fd > 5 OR b_fd > 5 THEN
    RAISE EXCEPTION 'Máximo 5 jugadores de campo por equipo' USING ERRCODE = 'check_violation';
  END IF;
  IF a_tot > 6 OR b_tot > 6 THEN
    RAISE EXCEPTION 'Máximo 6 jugadores por equipo' USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mop_team_pick_slots ON public.match_opportunity_participants;
CREATE TRIGGER trg_mop_team_pick_slots
  BEFORE INSERT OR UPDATE
  ON public.match_opportunity_participants
  FOR EACH ROW
  EXECUTE PROCEDURE public.enforce_team_pick_lineup_slots();

-- ---------------------------------------------------------------------------
-- 7) RLS: partidos team_pick_private solo creador / inscritos / admin
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS match_opportunities_select_authenticated ON public.match_opportunities;

CREATE POLICY match_opportunities_select_authenticated
  ON public.match_opportunities
  FOR SELECT
  TO authenticated
  USING (
    type IS DISTINCT FROM 'team_pick_private'::public.match_type
    OR creator_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.match_opportunity_participants p
      WHERE p.opportunity_id = match_opportunities.id
        AND p.user_id = auth.uid()
        AND p.status IN ('pending', 'confirmed')
    )
    OR public.is_admin()
  );

DROP POLICY IF EXISTS match_opportunities_select_anon_open_active ON public.match_opportunities;
CREATE POLICY match_opportunities_select_anon_open_active
  ON public.match_opportunities
  FOR SELECT
  TO anon
  USING (
    status IN ('pending', 'confirmed')
    AND (
      type = 'open'::public.match_type
      OR type = 'team_pick_public'::public.match_type
    )
  );

DROP POLICY IF EXISTS mop_select_anon_open_active ON public.match_opportunity_participants;
CREATE POLICY mop_select_anon_open_active
  ON public.match_opportunity_participants
  FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1
      FROM public.match_opportunities mo
      WHERE mo.id = opportunity_id
        AND mo.status IN ('pending', 'confirmed')
        AND (
          mo.type = 'open'::public.match_type
          OR mo.type = 'team_pick_public'::public.match_type
        )
    )
  );

-- ---------------------------------------------------------------------------
-- 8) Salir del partido: incluir team_pick_*
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.leave_match_opportunity_with_reason(
  p_opportunity_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  mo RECORD;
  v_reason text := trim(coalesce(p_reason, ''));
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  IF char_length(v_reason) < 5 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'reason_required');
  END IF;

  SELECT id, type, date_time, status, creator_id
    INTO mo
  FROM public.match_opportunities
  WHERE id = p_opportunity_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF mo.status IN ('completed', 'cancelled') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_closed');
  END IF;

  IF mo.type NOT IN (
    'players'::public.match_type,
    'open'::public.match_type,
    'team_pick_public'::public.match_type,
    'team_pick_private'::public.match_type
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_supported_for_type');
  END IF;

  IF mo.creator_id = auth.uid() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'creator_cannot_leave');
  END IF;

  IF now() > mo.date_time - interval '2 hours' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'too_late_leave');
  END IF;

  UPDATE public.match_opportunity_participants
  SET
    status = 'cancelled',
    cancelled_at = now(),
    cancelled_reason = v_reason
  WHERE opportunity_id = p_opportunity_id
    AND user_id = auth.uid()
    AND status IN ('pending', 'confirmed');

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_participant');
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ---------------------------------------------------------------------------
-- 9) RPC: crear partido team_pick + organizador en equipo A
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_team_pick_match_opportunity(
  p_type public.match_type,
  p_title text,
  p_description text,
  p_location text,
  p_venue text,
  p_city_id uuid,
  p_date_time timestamptz,
  p_level public.skill_level,
  p_gender public.gender,
  p_status public.match_status,
  p_sports_venue_id uuid,
  p_book_court_slot boolean,
  p_court_slot_minutes int,
  p_creator_encounter_role text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reservation_id uuid;
  v_match_id uuid;
  v_end timestamptz;
  v_code text;
  v_i int;
  v_found boolean;
  v_role text := lower(trim(coalesce(p_creator_encounter_role, '')));
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  IF p_type NOT IN (
    'team_pick_public'::public.match_type,
    'team_pick_private'::public.match_type
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_team_pick_type');
  END IF;

  IF v_role NOT IN ('gk', 'defensa', 'mediocampista', 'delantero') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_creator_role');
  END IF;

  v_code := NULL;
  IF p_type = 'team_pick_private'::public.match_type THEN
    v_found := false;
    FOR v_i IN 1..100 LOOP
      v_code := lpad((floor(random() * 10000))::int::text, 4, '0');
      IF NOT EXISTS (
        SELECT 1
        FROM public.match_opportunities mo
        WHERE mo.join_code = v_code
          AND mo.type = 'team_pick_private'::public.match_type
          AND mo.status IN ('pending', 'confirmed')
      ) THEN
        v_found := true;
        EXIT;
      END IF;
    END LOOP;
    IF NOT v_found THEN
      RETURN jsonb_build_object('ok', false, 'error', 'join_code_generation_failed');
    END IF;
  END IF;

  v_reservation_id := NULL;
  IF p_book_court_slot = true AND p_sports_venue_id IS NOT NULL THEN
    v_end := p_date_time
      + (GREATEST(15, LEAST(180, COALESCE(p_court_slot_minutes, 60)))::text || ' minutes')::interval;
    BEGIN
      v_reservation_id := public.book_venue_slot(p_sports_venue_id, p_date_time, v_end);
    EXCEPTION
      WHEN OTHERS THEN
        IF SQLERRM ILIKE '%no_court%' THEN
          RETURN jsonb_build_object('ok', false, 'error', 'no_court');
        END IF;
        RETURN jsonb_build_object('ok', false, 'error', 'reservation_failed', 'message', SQLERRM);
    END;
  END IF;

  INSERT INTO public.match_opportunities (
    type,
    title,
    description,
    location,
    venue,
    city_id,
    date_time,
    level,
    creator_id,
    team_name,
    players_needed,
    players_joined,
    players_seek_profile,
    gender,
    status,
    sports_venue_id,
    venue_reservation_id,
    private_revuelta_team_id,
    join_code
  )
  VALUES (
    p_type,
    p_title,
    p_description,
    p_location,
    p_venue,
    p_city_id,
    p_date_time,
    p_level,
    auth.uid(),
    NULL,
    12,
    0,
    NULL,
    p_gender,
    p_status,
    p_sports_venue_id,
    v_reservation_id,
    NULL,
    v_code
  )
  RETURNING id INTO v_match_id;

  IF v_reservation_id IS NOT NULL THEN
    UPDATE public.venue_reservations
    SET match_opportunity_id = v_match_id
    WHERE id = v_reservation_id;
  END IF;

  INSERT INTO public.match_opportunity_participants (
    opportunity_id,
    user_id,
    status,
    is_goalkeeper,
    pick_team,
    encounter_lineup_role
  )
  VALUES (
    v_match_id,
    auth.uid(),
    'confirmed',
    v_role = 'gk',
    'A',
    v_role
  );

  RETURN jsonb_build_object(
    'ok', true,
    'matchId', v_match_id,
    'reservationId', v_reservation_id,
    'joinCode', v_code
  );
EXCEPTION
  WHEN OTHERS THEN
    IF v_match_id IS NOT NULL THEN
      DELETE FROM public.match_opportunities WHERE id = v_match_id;
    END IF;
    IF v_reservation_id IS NOT NULL THEN
      DELETE FROM public.venue_reservations WHERE id = v_reservation_id;
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', 'server', 'message', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.create_team_pick_match_opportunity(
  public.match_type,
  text,
  text,
  text,
  text,
  uuid,
  timestamptz,
  public.skill_level,
  public.gender,
  public.match_status,
  uuid,
  boolean,
  int,
  text
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_team_pick_match_opportunity(
  public.match_type,
  text,
  text,
  text,
  text,
  uuid,
  timestamptz,
  public.skill_level,
  public.gender,
  public.match_status,
  uuid,
  boolean,
  int,
  text
) TO authenticated;

NOTIFY pgrst, 'reload schema';
