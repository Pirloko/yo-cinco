-- Revuelta privada: ver y responder solicitudes externas lo hace el organizador del partido (creator_id), no el capitán del equipo.

DROP POLICY IF EXISTS revuelta_ext_req_select_captain ON public.revuelta_external_join_requests;

CREATE POLICY revuelta_ext_req_select_organizer
  ON public.revuelta_external_join_requests
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.match_opportunities mo
      WHERE mo.id = opportunity_id
        AND mo.private_revuelta_team_id IS NOT NULL
        AND mo.creator_id = auth.uid()
    )
  );

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
  IF mo.creator_id IS DISTINCT FROM auth.uid() THEN
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
  IF mo.creator_id IS DISTINCT FROM auth.uid() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  UPDATE public.revuelta_external_join_requests
  SET status = 'declined', responded_at = now()
  WHERE id = p_request_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;
