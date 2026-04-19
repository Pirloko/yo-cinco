-- Colores identificadores Equipo A / B para modos team_pick_* + ampliación del RPC de creación.

ALTER TABLE public.match_opportunities
  ADD COLUMN IF NOT EXISTS team_pick_color_a text,
  ADD COLUMN IF NOT EXISTS team_pick_color_b text;

COMMENT ON COLUMN public.match_opportunities.team_pick_color_a IS
  'Color equipo A (#RRGGBB). Solo team_pick_public / team_pick_private.';
COMMENT ON COLUMN public.match_opportunities.team_pick_color_b IS
  'Color equipo B (#RRGGBB). Solo team_pick_public / team_pick_private.';

UPDATE public.match_opportunities
SET
  team_pick_color_a = coalesce(team_pick_color_a, '#16a34a'),
  team_pick_color_b = coalesce(team_pick_color_b, '#2563eb')
WHERE type IN (
  'team_pick_public'::public.match_type,
  'team_pick_private'::public.match_type
);

ALTER TABLE public.match_opportunities
  DROP CONSTRAINT IF EXISTS match_opportunities_team_pick_colors_hex_ck;

ALTER TABLE public.match_opportunities
  ADD CONSTRAINT match_opportunities_team_pick_colors_hex_ck
  CHECK (
    (type IS DISTINCT FROM 'team_pick_public'::public.match_type
     AND type IS DISTINCT FROM 'team_pick_private'::public.match_type)
    OR (
      team_pick_color_a IS NOT NULL
      AND team_pick_color_b IS NOT NULL
      AND team_pick_color_a ~ '^#[0-9A-Fa-f]{6}$'
      AND team_pick_color_b ~ '^#[0-9A-Fa-f]{6}$'
    )
  );

-- Reemplazar firma del RPC (añade colores).
DROP FUNCTION IF EXISTS public.create_team_pick_match_opportunity(
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
);

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
  p_creator_encounter_role text,
  p_team_pick_color_a text,
  p_team_pick_color_b text
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
  v_ca text := trim(coalesce(p_team_pick_color_a, ''));
  v_cb text := trim(coalesce(p_team_pick_color_b, ''));
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

  IF v_ca !~ '^#[0-9A-Fa-f]{6}$' OR v_cb !~ '^#[0-9A-Fa-f]{6}$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_team_colors');
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
    join_code,
    team_pick_color_a,
    team_pick_color_b
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
    v_code,
    lower(v_ca),
    lower(v_cb)
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
  text,
  text,
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
  text,
  text,
  text
) TO authenticated;

NOTIFY pgrst, 'reload schema';
