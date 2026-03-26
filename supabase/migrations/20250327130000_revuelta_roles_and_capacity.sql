-- Reglas de revuelta (tipo open):
-- - players_needed obligatorio entre 10 y 12
-- - cupos internos: máximo 2 arqueros, y se reservan 2 cupos para arqueros
--   (campo máx. = players_needed - 2)

-- Normalizar revueltas existentes antes del constraint (para no fallar al aplicar en DB con data).
UPDATE public.match_opportunities
SET players_needed =
  LEAST(12, GREATEST(10, COALESCE(players_needed, 10)))
WHERE type = 'open'
  AND (players_needed IS NULL OR players_needed < 10 OR players_needed > 12);

-- Agregar constraint sin validar primero; luego VALIDATE (evita error si hay concurrencia).
ALTER TABLE public.match_opportunities
  ADD CONSTRAINT match_opportunities_open_players_needed_range
  CHECK (
    type IS DISTINCT FROM 'open'
    OR (players_needed IS NOT NULL AND players_needed BETWEEN 10 AND 12)
  ) NOT VALID;

ALTER TABLE public.match_opportunities
  VALIDATE CONSTRAINT match_opportunities_open_players_needed_range;

CREATE OR REPLACE FUNCTION public.enforce_open_revuelta_role_slots()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  mo_type public.match_type;
  cap int;
  gk_cnt int;
  field_cnt int;
  joined_cnt int;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  SELECT mo.type, mo.players_needed
    INTO mo_type, cap
  FROM public.match_opportunities mo
  WHERE mo.id = NEW.opportunity_id;

  IF mo_type IS DISTINCT FROM 'open' THEN
    RETURN NEW;
  END IF;

  -- Conteo actual (excluye al usuario si está actualizando su fila)
  SELECT
    COUNT(*) FILTER (WHERE status IN ('pending','confirmed'))::int,
    COUNT(*) FILTER (WHERE status IN ('pending','confirmed') AND is_goalkeeper = true)::int,
    COUNT(*) FILTER (WHERE status IN ('pending','confirmed') AND is_goalkeeper = false)::int
  INTO joined_cnt, gk_cnt, field_cnt
  FROM public.match_opportunity_participants
  WHERE opportunity_id = NEW.opportunity_id
    AND user_id IS DISTINCT FROM NEW.user_id;

  IF cap IS NOT NULL AND cap > 0 AND joined_cnt >= cap THEN
    RAISE EXCEPTION 'No quedan cupos en este partido' USING ERRCODE = 'check_violation';
  END IF;

  -- Máx. 2 arqueros (además del trigger existente)
  IF COALESCE(NEW.is_goalkeeper, false) = true THEN
    IF gk_cnt >= 2 THEN
      RAISE EXCEPTION 'Ya hay 2 arqueros en esta revuelta' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  -- Campo: reservar 2 cupos para arqueros => campo máx. = cap - 2
  IF cap IS NOT NULL AND cap > 0 THEN
    IF field_cnt >= GREATEST(0, cap - 2) THEN
      RAISE EXCEPTION 'Solo quedan cupos de arquero' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mop_open_revuelta_role_slots ON public.match_opportunity_participants;
CREATE TRIGGER trg_mop_open_revuelta_role_slots
  BEFORE INSERT OR UPDATE ON public.match_opportunity_participants
  FOR EACH ROW EXECUTE PROCEDURE public.enforce_open_revuelta_role_slots();

REVOKE ALL ON FUNCTION public.enforce_open_revuelta_role_slots() FROM PUBLIC;
