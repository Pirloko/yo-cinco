-- Revuelta privada por equipo: solo miembros se unen directo; externos solicitan y el capitán acepta.

CREATE OR REPLACE FUNCTION public.is_confirmed_team_member(p_team_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members tm
    WHERE tm.team_id = p_team_id
      AND tm.user_id = p_user_id
      AND tm.status = 'confirmed'
  )
  OR EXISTS (
    SELECT 1 FROM public.teams t
    WHERE t.id = p_team_id AND t.captain_id = p_user_id
  );
$$;

ALTER TABLE public.match_opportunities
  ADD COLUMN IF NOT EXISTS private_revuelta_team_id UUID REFERENCES public.teams (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_match_opportunities_private_team
  ON public.match_opportunities (private_revuelta_team_id)
  WHERE private_revuelta_team_id IS NOT NULL;

ALTER TABLE public.match_opportunities
  ADD CONSTRAINT match_opportunities_private_revuelta_open_only
  CHECK (
    private_revuelta_team_id IS NULL
    OR type = 'open'
  );

CREATE OR REPLACE FUNCTION public.enforce_private_revuelta_creator_is_team_member()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.private_revuelta_team_id IS NOT NULL THEN
    IF NEW.type IS DISTINCT FROM 'open' THEN
      RAISE EXCEPTION 'private_revuelta_team_id solo aplica a type open';
    END IF;
    IF NOT public.is_confirmed_team_member(NEW.private_revuelta_team_id, NEW.creator_id) THEN
      RAISE EXCEPTION 'El organizador debe ser miembro confirmado del equipo de la revuelta privada';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_match_opportunities_private_revuelta_member ON public.match_opportunities;
CREATE TRIGGER trg_match_opportunities_private_revuelta_member
  BEFORE INSERT OR UPDATE OF private_revuelta_team_id, creator_id, type
  ON public.match_opportunities
  FOR EACH ROW
  EXECUTE PROCEDURE public.enforce_private_revuelta_creator_is_team_member();

-- Participantes: bloquear auto-inserción si es revuelta privada y el usuario no es del equipo
DROP POLICY IF EXISTS mop_insert_self ON public.match_opportunity_participants;

CREATE POLICY mop_insert_self
  ON public.match_opportunity_participants
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.match_opportunities mo
      WHERE mo.id = opportunity_id
        AND (
          mo.private_revuelta_team_id IS NULL
          OR public.is_confirmed_team_member(mo.private_revuelta_team_id, auth.uid())
        )
    )
  );

CREATE TABLE public.revuelta_external_join_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id UUID NOT NULL REFERENCES public.match_opportunities (id) ON DELETE CASCADE,
  requester_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  is_goalkeeper BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX uq_revuelta_ext_req_one_pending
  ON public.revuelta_external_join_requests (opportunity_id, requester_id)
  WHERE status = 'pending';

CREATE INDEX idx_revuelta_ext_req_opp ON public.revuelta_external_join_requests (opportunity_id, status);
CREATE INDEX idx_revuelta_ext_req_requester ON public.revuelta_external_join_requests (requester_id);

ALTER TABLE public.revuelta_external_join_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY revuelta_ext_req_select_self
  ON public.revuelta_external_join_requests
  FOR SELECT
  TO authenticated
  USING (requester_id = auth.uid());

CREATE POLICY revuelta_ext_req_select_captain
  ON public.revuelta_external_join_requests
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.match_opportunities mo
      INNER JOIN public.teams t ON t.id = mo.private_revuelta_team_id
      WHERE mo.id = opportunity_id
        AND t.captain_id = auth.uid()
    )
  );

CREATE POLICY revuelta_ext_req_insert_non_member
  ON public.revuelta_external_join_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (
    requester_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.match_opportunities mo
      WHERE mo.id = opportunity_id
        AND mo.private_revuelta_team_id IS NOT NULL
        AND mo.type = 'open'
        AND mo.status IN ('pending', 'confirmed')
        AND NOT public.is_confirmed_team_member(mo.private_revuelta_team_id, auth.uid())
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.revuelta_external_join_requests r0
      WHERE r0.opportunity_id = revuelta_external_join_requests.opportunity_id
        AND r0.requester_id = auth.uid()
        AND r0.status IN ('pending', 'accepted')
    )
  );

GRANT SELECT, INSERT ON public.revuelta_external_join_requests TO authenticated;

CREATE OR REPLACE FUNCTION public.accept_revuelta_external_request(p_request_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  mo RECORD;
  gk_count INT;
  field_count INT;
  joined_db INT;
  cap INT;
  gk_left INT;
  field_cap INT;
  field_left INT;
  insert_as_gk BOOLEAN;
BEGIN
  SELECT * INTO r FROM public.revuelta_external_join_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;
  IF r.status IS DISTINCT FROM 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_pending');
  END IF;

  SELECT * INTO mo FROM public.match_opportunities WHERE id = r.opportunity_id FOR UPDATE;
  IF mo.private_revuelta_team_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_private');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.teams t
    WHERE t.id = mo.private_revuelta_team_id AND t.captain_id = auth.uid()
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.match_opportunity_participants p
    WHERE p.opportunity_id = r.opportunity_id
      AND p.user_id = r.requester_id
      AND p.status IN ('pending', 'confirmed')
  ) THEN
    UPDATE public.revuelta_external_join_requests
    SET status = 'accepted', responded_at = now()
    WHERE id = p_request_id;
    RETURN jsonb_build_object('ok', true);
  END IF;

  SELECT
    COUNT(*) FILTER (WHERE status IN ('pending', 'confirmed'))::INT,
    COUNT(*) FILTER (WHERE status IN ('pending', 'confirmed') AND is_goalkeeper = true)::INT,
    COUNT(*) FILTER (WHERE status IN ('pending', 'confirmed') AND COALESCE(is_goalkeeper, false) = false)::INT
  INTO joined_db, gk_count, field_count
  FROM public.match_opportunity_participants
  WHERE opportunity_id = r.opportunity_id;

  cap := COALESCE(mo.players_needed, 0);
  IF cap > 0 AND joined_db >= cap THEN
    RETURN jsonb_build_object('ok', false, 'error', 'full');
  END IF;

  gk_left := GREATEST(0, 2 - gk_count);
  field_cap := GREATEST(0, cap - 2);
  field_left := GREATEST(0, field_cap - field_count);
  insert_as_gk := r.is_goalkeeper;

  IF insert_as_gk THEN
    IF gk_left <= 0 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'no_gk_slot');
    END IF;
  ELSE
    IF field_left <= 0 AND gk_left > 0 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'gk_only');
    END IF;
    IF field_left <= 0 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'full');
    END IF;
  END IF;

  INSERT INTO public.match_opportunity_participants (opportunity_id, user_id, status, is_goalkeeper)
  VALUES (r.opportunity_id, r.requester_id, 'confirmed', insert_as_gk);

  UPDATE public.revuelta_external_join_requests
  SET status = 'accepted', responded_at = now()
  WHERE id = p_request_id;

  RETURN jsonb_build_object('ok', true);
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'error', 'duplicate');
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION public.decline_revuelta_external_request(p_request_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  mo RECORD;
BEGIN
  SELECT * INTO r FROM public.revuelta_external_join_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;
  IF r.status IS DISTINCT FROM 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_pending');
  END IF;

  SELECT * INTO mo FROM public.match_opportunities WHERE id = r.opportunity_id;
  IF mo.private_revuelta_team_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_private');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.teams t
    WHERE t.id = mo.private_revuelta_team_id AND t.captain_id = auth.uid()
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  UPDATE public.revuelta_external_join_requests
  SET status = 'declined', responded_at = now()
  WHERE id = p_request_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.accept_revuelta_external_request(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.decline_revuelta_external_request(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_revuelta_external_request(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decline_revuelta_external_request(UUID) TO authenticated;

-- Organizador no puede inscribir a externos en revuelta privada (solo miembros del equipo).
DROP POLICY IF EXISTS mop_insert_as_creator ON public.match_opportunity_participants;

CREATE POLICY mop_insert_as_creator
  ON public.match_opportunity_participants
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_match_opportunity_creator(opportunity_id)
    AND EXISTS (
      SELECT 1 FROM public.match_opportunities mo
      WHERE mo.id = opportunity_id
        AND (
          mo.private_revuelta_team_id IS NULL
          OR public.is_confirmed_team_member(mo.private_revuelta_team_id, user_id)
        )
    )
  );
