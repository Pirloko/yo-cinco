-- Rol arquero en revueltas (tipo open): máximo 2 por oportunidad.
ALTER TABLE public.match_opportunity_participants
  ADD COLUMN IF NOT EXISTS is_goalkeeper BOOLEAN NOT NULL DEFAULT false;

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

DROP TRIGGER IF EXISTS trg_mop_goalkeeper_cap ON public.match_opportunity_participants;
CREATE TRIGGER trg_mop_goalkeeper_cap
  BEFORE INSERT OR UPDATE ON public.match_opportunity_participants
  FOR EACH ROW EXECUTE PROCEDURE public.enforce_open_revuelta_goalkeeper_limit();

-- Lectura pública para /revuelta/[id] (enlaces de invitación)
CREATE POLICY match_opportunities_select_anon_open_active
  ON public.match_opportunities
  FOR SELECT
  TO anon
  USING (
    type = 'open'
    AND status IN ('pending', 'confirmed')
  );

CREATE POLICY mop_select_anon_open_active
  ON public.match_opportunity_participants
  FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1
      FROM public.match_opportunities mo
      WHERE mo.id = opportunity_id
        AND mo.type = 'open'
        AND mo.status IN ('pending', 'confirmed')
    )
  );
