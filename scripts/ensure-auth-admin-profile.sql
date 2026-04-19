-- =============================================================================
-- Validar y reparar perfil de administrador (auth.users ↔ public.profiles)
-- =============================================================================
-- Si el usuario existe en Authentication pero no en profiles (o no es admin),
-- este script crea o actualiza la fila con account_type = admin.
--
-- Uso: Supabase → SQL Editor → edita SOLO la línea INSERT del correo → Run
-- =============================================================================

CREATE TEMP TABLE IF NOT EXISTS _ensure_admin_email (email text NOT NULL);
TRUNCATE _ensure_admin_email;
INSERT INTO _ensure_admin_email VALUES ('admin@gmail.com');

-- 1) Diagnóstico
SELECT 'auth.users' AS fuente, u.id, u.email, u.created_at
FROM auth.users u
WHERE lower(u.email) = lower((SELECT email FROM _ensure_admin_email));

SELECT 'public.profiles' AS fuente, p.id, p.name, p.account_type::text AS account_type
FROM public.profiles p
WHERE p.id = (SELECT id FROM auth.users WHERE lower(email) = lower((SELECT email FROM _ensure_admin_email)));

-- 2) Reparación
DO $$
DECLARE
  v_email text;
  v_uid uuid;
  v_city_id uuid;
  v_city_name text;
BEGIN
  SELECT e.email INTO v_email FROM _ensure_admin_email e;

  SELECT u.id INTO v_uid
  FROM auth.users u
  WHERE lower(u.email) = lower(v_email)
  LIMIT 1;

  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'No hay usuario en auth.users con email %', v_email;
  END IF;

  v_city_id := public.default_geo_city_id();
  SELECT gc.name INTO v_city_name
  FROM public.geo_cities gc
  WHERE gc.id = v_city_id
  LIMIT 1;
  v_city_name := coalesce(nullif(trim(v_city_name), ''), 'Rancagua');

  INSERT INTO public.profiles (
    id,
    name,
    age,
    gender,
    position,
    level,
    city,
    city_id,
    availability,
    photo_url,
    whatsapp_phone,
    account_type,
    player_essentials_completed_at
  )
  SELECT
    v_uid,
    coalesce(
      nullif(trim(u.raw_user_meta_data ->> 'full_name'), ''),
      nullif(trim(u.raw_user_meta_data ->> 'name'), ''),
      'Administrador'
    ),
    25,
    'male'::public.gender,
    'mediocampista'::public.position,
    'intermedio'::public.skill_level,
    v_city_name,
    v_city_id,
    '{}'::text[],
    '',
    '',
    'admin'::public.account_type,
    now()
  FROM auth.users u
  WHERE u.id = v_uid
  ON CONFLICT (id) DO UPDATE
  SET
    account_type = 'admin'::public.account_type,
    name = coalesce(
      nullif(trim(excluded.name), ''),
      public.profiles.name
    ),
    city_id = coalesce(public.profiles.city_id, excluded.city_id),
    updated_at = now();

  RAISE NOTICE 'OK: perfil admin para % (id %). Cierra sesión y vuelve a entrar en la app.', v_email, v_uid;
END $$;

-- 3) Comprobación final
SELECT p.id, u.email, p.name, p.account_type::text AS account_type
FROM public.profiles p
JOIN auth.users u ON u.id = p.id
WHERE lower(u.email) = lower((SELECT email FROM _ensure_admin_email));
