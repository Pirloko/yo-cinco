-- Fase 4 (joins):
-- - Validación en BD de cupos para tipo players según match_opportunities.players_seek_profile
-- - RPC para unirse a un partido (evita lógica crítica en UI)

-- ---------------------------------------------------------------------------
-- Trigger: enforce_players_seek_profile_slots()
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_players_seek_profile_slots()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  mo_type public.match_type;
  cap int;
  seek text;
  gk_cnt int;
  field_cnt int;
  joined_cnt int;
  max_field int;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  SELECT mo.type, mo.players_needed, mo.players_seek_profile
    INTO mo_type, cap, seek
  FROM public.match_opportunities mo
  WHERE mo.id = NEW.opportunity_id;

  IF mo_type IS DISTINCT FROM 'players' THEN
    RETURN NEW;
  END IF;

  cap := COALESCE(cap, 0);

  -- Conteo actual (excluye al usuario si está actualizando su fila)
  SELECT
    COUNT(*) FILTER (WHERE status IN ('pending','confirmed'))::int,
    COUNT(*) FILTER (WHERE status IN ('pending','confirmed') AND is_goalkeeper = true)::int,
    COUNT(*) FILTER (WHERE status IN ('pending','confirmed') AND COALESCE(is_goalkeeper, false) = false)::int
  INTO joined_cnt, gk_cnt, field_cnt
  FROM public.match_opportunity_participants
  WHERE opportunity_id = NEW.opportunity_id
    AND user_id IS DISTINCT FROM NEW.user_id;

  IF cap > 0 AND joined_cnt >= cap THEN
    RAISE EXCEPTION 'No quedan cupos en este partido' USING ERRCODE = 'check_violation';
  END IF;

  seek := COALESCE(NULLIF(TRIM(seek), ''), 'legacy');

  -- legacy: por compatibilidad, no imponemos restricciones extra (solo capacidad).
  IF seek = 'legacy' THEN
    RETURN NEW;
  END IF;

  IF seek = 'gk_only' THEN
    IF COALESCE(NEW.is_goalkeeper, false) IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'Esta búsqueda solo admite arqueros' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF seek = 'field_only' THEN
    IF COALESCE(NEW.is_goalkeeper, false) IS DISTINCT FROM false THEN
      RAISE EXCEPTION 'Solo buscan jugadores de campo' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  -- gk_and_field: máximo 1 arquero, resto campo (cap-1).
  IF seek = 'gk_and_field' THEN
    max_field := GREATEST(0, cap - 1);
    IF COALESCE(NEW.is_goalkeeper, false) = true THEN
      IF gk_cnt >= 1 THEN
        RAISE EXCEPTION 'Ya hay un arquero; en esta búsqueda solo cabe uno' USING ERRCODE = 'check_violation';
      END IF;
    ELSE
      IF cap > 0 AND field_cnt >= max_field THEN
        RAISE EXCEPTION 'No quedan cupos de jugador de campo' USING ERRCODE = 'check_violation';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_players_seek_profile_slots() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_mop_players_seek_profile_slots ON public.match_opportunity_participants;
CREATE TRIGGER trg_mop_players_seek_profile_slots
  BEFORE INSERT OR UPDATE ON public.match_opportunity_participants
  FOR EACH ROW EXECUTE PROCEDURE public.enforce_players_seek_profile_slots();

-- ---------------------------------------------------------------------------
-- RPC: join_match_opportunity()
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.join_match_opportunity(
  p_opportunity_id uuid,
  p_is_goalkeeper boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  mo RECORD;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  SELECT *
    INTO mo
  FROM public.match_opportunities
  WHERE id = p_opportunity_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF mo.creator_id = auth.uid() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'is_creator');
  END IF;

  -- Partido ya pasado: bloquea desde el inicio del día (en tz del servidor).
  IF mo.date_time < date_trunc('day', now()) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'past');
  END IF;

  -- Revuelta privada: solo miembros confirmados pueden unirse directo.
  IF mo.type = 'open' AND mo.private_revuelta_team_id IS NOT NULL THEN
    IF NOT public.is_confirmed_team_member(mo.private_revuelta_team_id, auth.uid()) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'private_revuelta_requires_request');
    END IF;
  END IF;

  -- Si ya existe participante activo, devolver ok (idempotente).
  IF EXISTS (
    SELECT 1
    FROM public.match_opportunity_participants p
    WHERE p.opportunity_id = p_opportunity_id
      AND p.user_id = auth.uid()
      AND p.status IN ('pending','confirmed')
  ) THEN
    RETURN jsonb_build_object('ok', true);
  END IF;

  INSERT INTO public.match_opportunity_participants (opportunity_id, user_id, status, is_goalkeeper)
  VALUES (p_opportunity_id, auth.uid(), 'confirmed', COALESCE(p_is_goalkeeper, false));

  RETURN jsonb_build_object('ok', true);
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', true);
  WHEN check_violation THEN
    -- Usamos SQLERRM como mensaje amigable ya definido en triggers existentes.
    RETURN jsonb_build_object('ok', false, 'error', 'rule', 'message', SQLERRM);
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', 'server', 'message', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.join_match_opportunity(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.join_match_opportunity(uuid, boolean) TO authenticated;

