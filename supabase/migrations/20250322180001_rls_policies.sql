-- Pichanga — Row Level Security (RLS)
-- Ejecutar después de 20250322180000_initial_schema.sql
--
-- Roles: el cliente usa la clave anon/public; tras login, JWT = rol authenticated.
-- auth.uid() = id del usuario en auth.users (UUID).
-- service_role y el rol postgres ignoran RLS (solo servidor/admin).

-- ---------------------------------------------------------------------------
-- Funciones auxiliares (SECURITY INVOKER por defecto: respetan RLS en subconsultas;
-- aquí solo leen tablas con políticas permisivas o usamos comparaciones directas)
-- ---------------------------------------------------------------------------

-- ¿auth.uid() es el creador de esta oportunidad?
CREATE OR REPLACE FUNCTION public.is_match_opportunity_creator(p_opportunity_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.match_opportunities mo
    WHERE mo.id = p_opportunity_id
      AND mo.creator_id = auth.uid()
  );
$$;

-- ¿Puede ver/participar en el chat de esta oportunidad? (creador o inscrito)
CREATE OR REPLACE FUNCTION public.can_access_opportunity_thread(p_opportunity_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.match_opportunities mo
    WHERE mo.id = p_opportunity_id
      AND mo.creator_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1
    FROM public.match_opportunity_participants p
    WHERE p.opportunity_id = p_opportunity_id
      AND p.user_id = auth.uid()
      AND p.status IN ('pending', 'confirmed')
  );
$$;

-- ¿auth.uid() es capitán del equipo?
CREATE OR REPLACE FUNCTION public.is_team_captain(p_team_id uuid)
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

REVOKE ALL ON FUNCTION public.is_match_opportunity_creator(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_access_opportunity_thread(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_team_captain(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_match_opportunity_creator(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_opportunity_thread(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_team_captain(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- RLS: activar en todas las tablas de aplicación
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_opportunity_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_invites ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
-- Lectura: usuarios logueados ven perfiles (descubrimiento / listados).
CREATE POLICY profiles_select_authenticated
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (true);

-- Alta manual solo si coincide con el usuario de la sesión (el trigger de signup suele ir con rol service).
CREATE POLICY profiles_insert_own_id
  ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- Solo el dueño actualiza su fila.
CREATE POLICY profiles_update_own
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Opcional: permitir borrar cuenta propia (cascade desde auth lo gestionas en Auth; esto es coherente con borrar perfil).
CREATE POLICY profiles_delete_own
  ON public.profiles
  FOR DELETE
  TO authenticated
  USING (auth.uid() = id);

-- ---------------------------------------------------------------------------
-- match_opportunities
-- ---------------------------------------------------------------------------
CREATE POLICY match_opportunities_select_authenticated
  ON public.match_opportunities
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY match_opportunities_insert_creator
  ON public.match_opportunities
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = creator_id);

CREATE POLICY match_opportunities_update_creator
  ON public.match_opportunities
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = creator_id)
  WITH CHECK (auth.uid() = creator_id);

CREATE POLICY match_opportunities_delete_creator
  ON public.match_opportunities
  FOR DELETE
  TO authenticated
  USING (auth.uid() = creator_id);

-- ---------------------------------------------------------------------------
-- match_opportunity_participants
-- ---------------------------------------------------------------------------
CREATE POLICY mop_select_authenticated
  ON public.match_opportunity_participants
  FOR SELECT
  TO authenticated
  USING (true);

-- Uno se apunta a sí mismo a una oportunidad existente.
CREATE POLICY mop_insert_self
  ON public.match_opportunity_participants
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.match_opportunities mo WHERE mo.id = opportunity_id
    )
  );

-- El creador de la oportunidad puede inscribir a otra persona (equipos / convocatoria).
CREATE POLICY mop_insert_as_creator
  ON public.match_opportunity_participants
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_match_opportunity_creator(opportunity_id));

CREATE POLICY mop_update_self_or_creator
  ON public.match_opportunity_participants
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = user_id
    OR public.is_match_opportunity_creator(opportunity_id)
  )
  WITH CHECK (
    auth.uid() = user_id
    OR public.is_match_opportunity_creator(opportunity_id)
  );

CREATE POLICY mop_delete_self_or_creator
  ON public.match_opportunity_participants
  FOR DELETE
  TO authenticated
  USING (
    auth.uid() = user_id
    OR public.is_match_opportunity_creator(opportunity_id)
  );

-- ---------------------------------------------------------------------------
-- matches (instancias de partido)
-- ---------------------------------------------------------------------------
CREATE POLICY matches_select_authenticated
  ON public.matches
  FOR SELECT
  TO authenticated
  USING (true);

-- Crear instancia ligada a una oportunidad que yo creé (o sin oportunidad: solo si quieres flujos libres).
CREATE POLICY matches_insert_creator_of_opportunity
  ON public.matches
  FOR INSERT
  TO authenticated
  WITH CHECK (
    opportunity_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.match_opportunities o
      WHERE o.id = opportunity_id
        AND o.creator_id = auth.uid()
    )
  );

CREATE POLICY matches_update_creator_of_opportunity
  ON public.matches
  FOR UPDATE
  TO authenticated
  USING (
    opportunity_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.match_opportunities o
      WHERE o.id = opportunity_id
        AND o.creator_id = auth.uid()
    )
  )
  WITH CHECK (
    opportunity_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.match_opportunities o
      WHERE o.id = opportunity_id
        AND o.creator_id = auth.uid()
    )
  );

CREATE POLICY matches_delete_creator_of_opportunity
  ON public.matches
  FOR DELETE
  TO authenticated
  USING (
    opportunity_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.match_opportunities o
      WHERE o.id = opportunity_id
        AND o.creator_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- match_participants
-- ---------------------------------------------------------------------------
CREATE POLICY match_participants_select_authenticated
  ON public.match_participants
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY match_participants_insert_self_or_creator
  ON public.match_participants
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1
      FROM public.matches m
      JOIN public.match_opportunities o ON o.id = m.opportunity_id
      WHERE m.id = match_id
        AND o.creator_id = auth.uid()
    )
  );

CREATE POLICY match_participants_delete_self_or_creator
  ON public.match_participants
  FOR DELETE
  TO authenticated
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1
      FROM public.matches m
      JOIN public.match_opportunities o ON o.id = m.opportunity_id
      WHERE m.id = match_id
        AND o.creator_id = auth.uid()
    )
  );

-- Sin UPDATE explícito: borrar y volver a insertar si hace falta.

-- ---------------------------------------------------------------------------
-- messages (hilo por opportunity_id)
-- ---------------------------------------------------------------------------
CREATE POLICY messages_select_thread
  ON public.messages
  FOR SELECT
  TO authenticated
  USING (public.can_access_opportunity_thread(opportunity_id));

CREATE POLICY messages_insert_sender_in_thread
  ON public.messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND public.can_access_opportunity_thread(opportunity_id)
  );

CREATE POLICY messages_update_sender
  ON public.messages
  FOR UPDATE
  TO authenticated
  USING (sender_id = auth.uid())
  WITH CHECK (sender_id = auth.uid());

CREATE POLICY messages_delete_sender
  ON public.messages
  FOR DELETE
  TO authenticated
  USING (sender_id = auth.uid());

-- ---------------------------------------------------------------------------
-- teams
-- ---------------------------------------------------------------------------
CREATE POLICY teams_select_authenticated
  ON public.teams
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY teams_insert_as_captain
  ON public.teams
  FOR INSERT
  TO authenticated
  WITH CHECK (captain_id = auth.uid());

CREATE POLICY teams_update_captain
  ON public.teams
  FOR UPDATE
  TO authenticated
  USING (captain_id = auth.uid())
  WITH CHECK (captain_id = auth.uid());

CREATE POLICY teams_delete_captain
  ON public.teams
  FOR DELETE
  TO authenticated
  USING (captain_id = auth.uid());

-- ---------------------------------------------------------------------------
-- team_members
-- ---------------------------------------------------------------------------
CREATE POLICY team_members_select_authenticated
  ON public.team_members
  FOR SELECT
  TO authenticated
  USING (true);

-- Capitán gestiona plantilla; el usuario puede insertar su propia fila (aceptar invitación / unirse si el flujo lo permite).
CREATE POLICY team_members_insert_captain
  ON public.team_members
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_team_captain(team_id));

-- Solo unirse si existe invitación pendiente hacia este usuario (aceptar invitación).
CREATE POLICY team_members_insert_self_pending_invite
  ON public.team_members
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
      FROM public.team_invites ti
      WHERE ti.team_id = team_id
        AND ti.invitee_id = auth.uid()
        AND ti.status = 'pending'
    )
  );

CREATE POLICY team_members_update_captain_or_self
  ON public.team_members
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = user_id
    OR public.is_team_captain(team_id)
  )
  WITH CHECK (
    auth.uid() = user_id
    OR public.is_team_captain(team_id)
  );

CREATE POLICY team_members_delete_captain_or_self
  ON public.team_members
  FOR DELETE
  TO authenticated
  USING (
    auth.uid() = user_id
    OR public.is_team_captain(team_id)
  );

-- ---------------------------------------------------------------------------
-- team_invites
-- ---------------------------------------------------------------------------
CREATE POLICY team_invites_select_parties
  ON public.team_invites
  FOR SELECT
  TO authenticated
  USING (inviter_id = auth.uid() OR invitee_id = auth.uid());

-- Solo capitán envía invitación y debe figurar como inviter.
CREATE POLICY team_invites_insert_captain
  ON public.team_invites
  FOR INSERT
  TO authenticated
  WITH CHECK (
    inviter_id = auth.uid()
    AND public.is_team_captain(team_id)
  );

CREATE POLICY team_invites_update_parties
  ON public.team_invites
  FOR UPDATE
  TO authenticated
  USING (inviter_id = auth.uid() OR invitee_id = auth.uid())
  WITH CHECK (inviter_id = auth.uid() OR invitee_id = auth.uid());

CREATE POLICY team_invites_delete_parties
  ON public.team_invites
  FOR DELETE
  TO authenticated
  USING (inviter_id = auth.uid() OR invitee_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Permisos de tablas para el rol authenticated (Supabase suele otorgarlos; por si acaso)
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;
