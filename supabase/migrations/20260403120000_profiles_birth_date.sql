-- Fecha de nacimiento: edad derivada automáticamente cada año vía trigger.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS birth_date DATE;

COMMENT ON COLUMN public.profiles.birth_date IS 'Fecha de nacimiento; age se mantiene sincronizado.';

CREATE OR REPLACE FUNCTION public.profiles_sync_age_from_birth_date()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.birth_date IS NOT NULL THEN
    NEW.age := GREATEST(
      0,
      LEAST(
        120,
        (EXTRACT(YEAR FROM age(CURRENT_DATE::timestamp, NEW.birth_date::timestamp)))::integer
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_sync_age_from_birth_date ON public.profiles;
CREATE TRIGGER trg_profiles_sync_age_from_birth_date
  BEFORE INSERT OR UPDATE OF birth_date ON public.profiles
  FOR EACH ROW
  EXECUTE PROCEDURE public.profiles_sync_age_from_birth_date();

-- Aproximación para perfiles existentes (solo si aún no hay fecha).
UPDATE public.profiles
SET birth_date = (CURRENT_DATE - ((age::text || ' years')::interval))::date
WHERE birth_date IS NULL
  AND age IS NOT NULL
  AND age > 0
  AND age <= 120;
