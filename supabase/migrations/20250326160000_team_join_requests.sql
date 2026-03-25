-- Solicitudes de ingreso a equipo: el jugador pide; el capitán acepta o rechaza.

CREATE TABLE public.team_join_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.teams (id) ON DELETE CASCADE,
  requester_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  status public.invite_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Un solo pendiente por (equipo, solicitante).
CREATE UNIQUE INDEX uq_team_join_requests_pending
  ON public.team_join_requests (team_id, requester_id)
  WHERE status = 'pending';

CREATE INDEX idx_team_join_requests_team ON public.team_join_requests (team_id, status);
CREATE INDEX idx_team_join_requests_requester ON public.team_join_requests (requester_id, status);

DROP TRIGGER IF EXISTS trg_team_join_requests_updated ON public.team_join_requests;
CREATE TRIGGER trg_team_join_requests_updated
  BEFORE UPDATE ON public.team_join_requests
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

CREATE OR REPLACE FUNCTION public.is_team_member(p_team_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.team_members tm
    WHERE tm.team_id = p_team_id
      AND tm.user_id = p_user_id
  );
$$;

REVOKE ALL ON FUNCTION public.is_team_member(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_team_member(uuid, uuid) TO authenticated;

ALTER TABLE public.team_join_requests ENABLE ROW LEVEL SECURITY;

-- Lectura: solicitante o capitán del equipo.
CREATE POLICY team_join_requests_select
  ON public.team_join_requests
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = requester_id
    OR public.is_team_captain(team_id)
  );

-- Alta: solo el propio usuario; no capitán ni ya miembro; mismo género que el equipo.
CREATE POLICY team_join_requests_insert_requester
  ON public.team_join_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = requester_id
    AND NOT public.is_team_captain(team_id)
    AND NOT public.is_team_member(team_id, auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.teams t
      INNER JOIN public.profiles p ON p.id = auth.uid()
      WHERE t.id = team_id
        AND t.gender = p.gender
    )
  );

-- Capitán: aceptar o rechazar (actualizar status).
CREATE POLICY team_join_requests_update_captain
  ON public.team_join_requests
  FOR UPDATE
  TO authenticated
  USING (public.is_team_captain(team_id))
  WITH CHECK (public.is_team_captain(team_id));

-- Solicitante: cancelar su propia solicitud pendiente (borrar).
CREATE POLICY team_join_requests_delete_requester_pending
  ON public.team_join_requests
  FOR DELETE
  TO authenticated
  USING (auth.uid() = requester_id AND status = 'pending');

GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_join_requests TO authenticated;
