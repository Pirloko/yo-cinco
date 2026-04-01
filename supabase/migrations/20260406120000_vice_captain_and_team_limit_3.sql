-- Vicecapitán (un solo designado por equipo): mismos permisos de gestión que el capitán
-- excepto datos sensibles (solo capitán principal: private settings, logo en Storage ya filtrado por captain_id).
-- Límite de equipos por usuario: 3 (antes 5).

-- ---------------------------------------------------------------------------
-- teams.vice_captain_id
-- ---------------------------------------------------------------------------
ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS vice_captain_id UUID REFERENCES public.profiles (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_teams_vice_captain
  ON public.teams (vice_captain_id)
  WHERE vice_captain_id IS NOT NULL;

COMMENT ON COLUMN public.teams.vice_captain_id IS 'Segundo capitán: gestión de plantilla, desafíos y solicitudes. Solo el capitán principal edita datos sensibles y private settings.';

CREATE OR REPLACE FUNCTION public.enforce_teams_vice_captain_member()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.vice_captain_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.vice_captain_id = NEW.captain_id THEN
    RAISE EXCEPTION 'vice_captain_must_differ_from_captain' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.team_members tm
    WHERE tm.team_id = NEW.id
      AND tm.user_id = NEW.vice_captain_id
      AND tm.status = 'confirmed'
  ) THEN
    RAISE EXCEPTION 'vice_captain_must_be_confirmed_member' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_teams_vice_captain_member ON public.teams;
CREATE TRIGGER trg_teams_vice_captain_member
  BEFORE INSERT OR UPDATE OF vice_captain_id, captain_id
  ON public.teams
  FOR EACH ROW
  EXECUTE PROCEDURE public.enforce_teams_vice_captain_member();

REVOKE ALL ON FUNCTION public.enforce_teams_vice_captain_member() FROM PUBLIC;

-- Al borrar un miembro que era vice, limpiar la columna
CREATE OR REPLACE FUNCTION public.trg_team_members_clear_vice_on_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.teams
  SET vice_captain_id = NULL, updated_at = now()
  WHERE id = OLD.team_id
    AND vice_captain_id IS NOT NULL
    AND vice_captain_id = OLD.user_id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_team_members_clear_vice ON public.team_members;
CREATE TRIGGER trg_team_members_clear_vice
  AFTER DELETE ON public.team_members
  FOR EACH ROW
  EXECUTE PROCEDURE public.trg_team_members_clear_vice_on_delete();

REVOKE ALL ON FUNCTION public.trg_team_members_clear_vice_on_delete() FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- Funciones de rol
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_team_primary_captain(p_team_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.teams t
    WHERE t.id = p_team_id
      AND t.captain_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_team_staff_captain(p_team_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.teams t
    WHERE t.id = p_team_id
      AND (
        t.captain_id = auth.uid()
        OR (t.vice_captain_id IS NOT NULL AND t.vice_captain_id = auth.uid())
      )
  );
$$;

-- is_team_captain: compatibilidad — ahora = staff (capitán o vice) para plantilla / invitaciones / solicitudes
CREATE OR REPLACE FUNCTION public.is_team_captain(p_team_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_team_staff_captain(p_team_id);
$$;

REVOKE ALL ON FUNCTION public.is_team_primary_captain(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_team_staff_captain(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_team_primary_captain(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_team_staff_captain(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- team_private_settings: solo capitán principal
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS team_private_settings_select_member_or_captain ON public.team_private_settings;
CREATE POLICY team_private_settings_select_member_or_captain
  ON public.team_private_settings
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.team_id = team_private_settings.team_id
        AND tm.user_id = auth.uid()
        AND tm.status = 'confirmed'
    )
    OR public.is_team_primary_captain(team_id)
  );

DROP POLICY IF EXISTS team_private_settings_insert_captain ON public.team_private_settings;
CREATE POLICY team_private_settings_insert_captain
  ON public.team_private_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_team_primary_captain(team_id));

DROP POLICY IF EXISTS team_private_settings_update_captain ON public.team_private_settings;
CREATE POLICY team_private_settings_update_captain
  ON public.team_private_settings
  FOR UPDATE
  TO authenticated
  USING (public.is_team_primary_captain(team_id))
  WITH CHECK (public.is_team_primary_captain(team_id));

DROP POLICY IF EXISTS team_private_settings_delete_captain ON public.team_private_settings;
CREATE POLICY team_private_settings_delete_captain
  ON public.team_private_settings
  FOR DELETE
  TO authenticated
  USING (public.is_team_primary_captain(team_id));

-- ---------------------------------------------------------------------------
-- team_members UPDATE: staff no edita la fila del capitán principal (solo el propio capitán)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS team_members_update_captain_or_self ON public.team_members;

CREATE POLICY team_members_update_captain_or_self
  ON public.team_members
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = user_id
    OR (
      public.is_team_staff_captain(team_id)
      AND user_id <>
        (SELECT t.captain_id FROM public.teams t WHERE t.id = team_members.team_id)
    )
  )
  WITH CHECK (
    auth.uid() = user_id
    OR (
      public.is_team_staff_captain(team_id)
      AND user_id <>
        (SELECT t.captain_id FROM public.teams t WHERE t.id = team_members.team_id)
    )
  );

-- ---------------------------------------------------------------------------
-- team_members DELETE: staff puede sacar miembros, no la fila del capitán principal
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS team_members_delete_captain_or_self ON public.team_members;

CREATE POLICY team_members_delete_captain_or_self
  ON public.team_members
  FOR DELETE
  TO authenticated
  USING (
    (
      auth.uid() = user_id
      AND user_id <> (SELECT t.captain_id FROM public.teams t WHERE t.id = team_members.team_id)
    )
    OR (
      public.is_team_staff_captain(team_id)
      AND user_id <> (SELECT t.captain_id FROM public.teams t WHERE t.id = team_members.team_id)
    )
  );

-- ---------------------------------------------------------------------------
-- rival_challenges: staff puede ver / aceptar / rechazar por equipo
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS rival_challenges_select_related ON public.rival_challenges;
CREATE POLICY rival_challenges_select_related
  ON public.rival_challenges
  FOR SELECT
  TO authenticated
  USING (
    challenger_captain_id = auth.uid()
    OR challenged_captain_id = auth.uid()
    OR (
      challenged_team_id IS NOT NULL
      AND public.is_team_staff_captain(challenged_team_id)
    )
    OR (
      mode = 'open'
      AND status = 'pending'
      AND EXISTS (
        SELECT 1
        FROM public.teams t
        WHERE (t.captain_id = auth.uid() OR t.vice_captain_id = auth.uid())
          AND t.id <> challenger_team_id
      )
    )
  );

DROP POLICY IF EXISTS rival_challenges_update_accept_decline ON public.rival_challenges;
CREATE POLICY rival_challenges_update_accept_decline
  ON public.rival_challenges
  FOR UPDATE
  TO authenticated
  USING (
    status = 'pending'
    AND (
      challenged_captain_id = auth.uid()
      OR (
        challenged_team_id IS NOT NULL
        AND public.is_team_staff_captain(challenged_team_id)
      )
      OR (
        mode = 'open'
        AND EXISTS (
          SELECT 1
          FROM public.teams t
          WHERE (t.captain_id = auth.uid() OR t.vice_captain_id = auth.uid())
            AND t.id <> challenger_team_id
        )
      )
      OR challenger_captain_id = auth.uid()
    )
  )
  WITH CHECK (
    (
      status IN ('accepted', 'declined')
      AND (
        challenged_captain_id = auth.uid()
        OR (
          challenged_team_id IS NOT NULL
          AND public.is_team_staff_captain(challenged_team_id)
        )
        OR (
          mode = 'open'
          AND EXISTS (
            SELECT 1
            FROM public.teams t
            WHERE t.id = accepted_team_id
              AND (t.captain_id = auth.uid() OR t.vice_captain_id = auth.uid())
          )
        )
      )
    )
    OR (status = 'cancelled' AND challenger_captain_id = auth.uid())
  );

DROP POLICY IF EXISTS rival_challenges_insert_challenger ON public.rival_challenges;

CREATE POLICY rival_challenges_insert_staff_challenger
  ON public.rival_challenges
  FOR INSERT
  TO authenticated
  WITH CHECK (
    challenger_captain_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.teams t
      WHERE t.id = challenger_team_id
        AND (t.captain_id = auth.uid() OR t.vice_captain_id = auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- Límite 3 equipos por usuario
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_team_members_limit_5()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  IF NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM public.team_members tm
  WHERE tm.user_id = NEW.user_id;

  IF v_count >= 3 THEN
    RAISE EXCEPTION 'team_limit_reached' USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_teams_limit_5_on_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  IF NEW.captain_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM public.team_members tm
  WHERE tm.user_id = NEW.captain_id;

  IF v_count >= 3 THEN
    RAISE EXCEPTION 'team_limit_reached' USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;
