-- Lectura pública mínima para la ficha de equipo en /equipo/[id] (enlaces de invitación).
-- Los UUID no son enumerables vía PostgREST sin listar; el riesgo es compartir enlace con quien no debiera.
-- Para nombres en plantilla sin service role, la app usa solo datos de team_members (foto/posición).

CREATE POLICY teams_select_anon_public_invite
  ON public.teams
  FOR SELECT
  TO anon
  USING (true);

CREATE POLICY team_members_select_anon_public_invite
  ON public.team_members
  FOR SELECT
  TO anon
  USING (true);
