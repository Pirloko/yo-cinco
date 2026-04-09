-- Fase 4 (robustez): crear equipo + registrar capitán como miembro confirmado en una sola transacción.

CREATE OR REPLACE FUNCTION public.create_team_with_captain(
  p_name text,
  p_logo_url text,
  p_level public.skill_level,
  p_city text,
  p_city_id uuid,
  p_gender public.gender,
  p_description text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_team_id uuid;
  v_prof RECORD;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  SELECT position, photo_url, gender
  INTO v_prof
  FROM public.profiles
  WHERE id = auth.uid();

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'profile_not_found');
  END IF;

  -- Coherencia básica: el equipo debe ser del mismo género del creador.
  IF v_prof.gender IS DISTINCT FROM p_gender THEN
    RETURN jsonb_build_object('ok', false, 'error', 'gender_mismatch');
  END IF;

  INSERT INTO public.teams (
    name,
    logo_url,
    level,
    captain_id,
    city,
    city_id,
    gender,
    description
  )
  VALUES (
    p_name,
    NULLIF(TRIM(p_logo_url), ''),
    p_level,
    auth.uid(),
    p_city,
    p_city_id,
    p_gender,
    NULLIF(TRIM(p_description), '')
  )
  RETURNING id INTO v_team_id;

  INSERT INTO public.team_members (
    team_id,
    user_id,
    position,
    photo_url,
    status
  )
  VALUES (
    v_team_id,
    auth.uid(),
    v_prof.position,
    COALESCE(v_prof.photo_url, ''),
    'confirmed'
  );

  RETURN jsonb_build_object('ok', true, 'teamId', v_team_id);
EXCEPTION
  WHEN check_violation THEN
    RETURN jsonb_build_object('ok', false, 'error', 'rule', 'message', SQLERRM);
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', 'server', 'message', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.create_team_with_captain(
  text,
  text,
  public.skill_level,
  text,
  uuid,
  public.gender,
  text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_team_with_captain(
  text,
  text,
  public.skill_level,
  text,
  uuid,
  public.gender,
  text
) TO authenticated;

