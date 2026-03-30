-- ============================================================================
-- Ubicación geográfica (Bloque 1 de N)
--
-- Plan por bloques:
--   1) Esta migración: tablas geo_* + seed Chile → VI Región → Rancagua,
--      columnas city_id + backfill + RLS + default para nuevas filas.
--   2) App: tipos, queries Supabase, leer catálogo en cliente.
--   3) UI: selects encadenados (de momento solo Rancagua visible / deshabilitado).
--   4) Admin: API + pantalla para alta país/región/ciudad.
--   5) Filtros por city_id del perfil; opcional retirar columna city TEXT antigua.
--
-- De momento solo existe un país (CL), una región (VI) y una ciudad (Rancagua).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Catálogo
-- ---------------------------------------------------------------------------
CREATE TABLE public.geo_countries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  iso_code TEXT NOT NULL,
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT geo_countries_iso_code_lower CHECK (iso_code = lower(iso_code)),
  CONSTRAINT geo_countries_iso_code_len CHECK (char_length(iso_code) = 2)
);

CREATE UNIQUE INDEX geo_countries_iso_code_key ON public.geo_countries (iso_code);

CREATE TABLE public.geo_regions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_id UUID NOT NULL REFERENCES public.geo_countries (id) ON DELETE RESTRICT,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT geo_regions_code_upper CHECK (code = upper(code))
);

CREATE UNIQUE INDEX geo_regions_country_code_key ON public.geo_regions (country_id, code);

CREATE INDEX idx_geo_regions_country ON public.geo_regions (country_id);

CREATE TABLE public.geo_cities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  region_id UUID NOT NULL REFERENCES public.geo_regions (id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT geo_cities_slug_lower CHECK (slug = lower(slug))
);

CREATE UNIQUE INDEX geo_cities_region_slug_key ON public.geo_cities (region_id, slug);

CREATE INDEX idx_geo_cities_region ON public.geo_cities (region_id);

-- Seed: Chile, VI Región, Rancagua
INSERT INTO public.geo_countries (iso_code, name, is_active)
VALUES ('cl', 'Chile', true);

INSERT INTO public.geo_regions (country_id, code, name, is_active)
SELECT c.id, 'VI', 'Región del Libertador General Bernardo O''Higgins', true
FROM public.geo_countries c
WHERE c.iso_code = 'cl';

INSERT INTO public.geo_cities (region_id, name, slug, is_active)
SELECT r.id, 'Rancagua', 'rancagua', true
FROM public.geo_regions r
JOIN public.geo_countries c ON c.id = r.country_id
WHERE c.iso_code = 'cl' AND r.code = 'VI';

-- Ciudad por defecto (nuevas filas hasta que la app envíe otro city_id)
CREATE OR REPLACE FUNCTION public.default_geo_city_id()
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT c.id
  FROM public.geo_cities c
  INNER JOIN public.geo_regions r ON r.id = c.region_id
  INNER JOIN public.geo_countries co ON co.id = r.country_id
  WHERE co.iso_code = 'cl'
    AND r.code = 'VI'
    AND c.slug = 'rancagua'
    AND c.is_active
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.default_geo_city_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.default_geo_city_id() TO authenticated, anon;

-- ---------------------------------------------------------------------------
-- FKs en tablas de negocio (conviven con city TEXT hasta Bloque 5)
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS city_id UUID REFERENCES public.geo_cities (id) ON DELETE RESTRICT;

ALTER TABLE public.sports_venues
  ADD COLUMN IF NOT EXISTS city_id UUID REFERENCES public.geo_cities (id) ON DELETE RESTRICT;

ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS city_id UUID REFERENCES public.geo_cities (id) ON DELETE RESTRICT;

ALTER TABLE public.match_opportunities
  ADD COLUMN IF NOT EXISTS city_id UUID REFERENCES public.geo_cities (id) ON DELETE RESTRICT;

UPDATE public.profiles SET city_id = public.default_geo_city_id() WHERE city_id IS NULL;
UPDATE public.sports_venues SET city_id = public.default_geo_city_id() WHERE city_id IS NULL;
UPDATE public.teams SET city_id = public.default_geo_city_id() WHERE city_id IS NULL;
UPDATE public.match_opportunities SET city_id = public.default_geo_city_id() WHERE city_id IS NULL;

ALTER TABLE public.profiles
  ALTER COLUMN city_id SET NOT NULL,
  ALTER COLUMN city_id SET DEFAULT public.default_geo_city_id();

ALTER TABLE public.sports_venues
  ALTER COLUMN city_id SET NOT NULL,
  ALTER COLUMN city_id SET DEFAULT public.default_geo_city_id();

ALTER TABLE public.teams
  ALTER COLUMN city_id SET NOT NULL,
  ALTER COLUMN city_id SET DEFAULT public.default_geo_city_id();

ALTER TABLE public.match_opportunities
  ALTER COLUMN city_id SET NOT NULL,
  ALTER COLUMN city_id SET DEFAULT public.default_geo_city_id();

CREATE INDEX IF NOT EXISTS idx_profiles_city_id ON public.profiles (city_id);
CREATE INDEX IF NOT EXISTS idx_sports_venues_city_id ON public.sports_venues (city_id);
CREATE INDEX IF NOT EXISTS idx_teams_city_id ON public.teams (city_id);
CREATE INDEX IF NOT EXISTS idx_match_opportunities_city_id ON public.match_opportunities (city_id);
CREATE INDEX IF NOT EXISTS idx_match_opportunities_city_id_time
  ON public.match_opportunities (city_id, date_time);

-- ---------------------------------------------------------------------------
-- RLS: lectura pública del catálogo; mutación solo admin (listo para Bloque 4)
-- ---------------------------------------------------------------------------
ALTER TABLE public.geo_countries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.geo_regions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.geo_cities ENABLE ROW LEVEL SECURITY;

CREATE POLICY geo_countries_select_all
  ON public.geo_countries FOR SELECT
  USING (true);

CREATE POLICY geo_regions_select_all
  ON public.geo_regions FOR SELECT
  USING (true);

CREATE POLICY geo_cities_select_all
  ON public.geo_cities FOR SELECT
  USING (true);

CREATE POLICY geo_countries_admin_insert
  ON public.geo_countries FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY geo_countries_admin_update
  ON public.geo_countries FOR UPDATE TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY geo_countries_admin_delete
  ON public.geo_countries FOR DELETE TO authenticated
  USING (public.is_admin());

CREATE POLICY geo_regions_admin_insert
  ON public.geo_regions FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY geo_regions_admin_update
  ON public.geo_regions FOR UPDATE TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY geo_regions_admin_delete
  ON public.geo_regions FOR DELETE TO authenticated
  USING (public.is_admin());

CREATE POLICY geo_cities_admin_insert
  ON public.geo_cities FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY geo_cities_admin_update
  ON public.geo_cities FOR UPDATE TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY geo_cities_admin_delete
  ON public.geo_cities FOR DELETE TO authenticated
  USING (public.is_admin());

GRANT SELECT ON public.geo_countries TO anon;
GRANT SELECT ON public.geo_regions TO anon;
GRANT SELECT ON public.geo_cities TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.geo_countries TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.geo_regions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.geo_cities TO authenticated;
GRANT ALL ON public.geo_countries TO service_role;
GRANT ALL ON public.geo_regions TO service_role;
GRANT ALL ON public.geo_cities TO service_role;
