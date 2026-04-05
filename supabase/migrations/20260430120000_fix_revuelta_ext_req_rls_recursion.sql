-- Evita "infinite recursion detected in policy for relation revuelta_external_join_requests":
-- el WITH CHECK del INSERT hacía NOT EXISTS (SELECT … FROM la misma tabla), lo que reevalúa RLS en bucle.
-- Esta función corre como definer y lee la tabla sin pasar por políticas.

CREATE OR REPLACE FUNCTION public.revuelta_ext_req_has_blocking_row_for_me(p_opportunity_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.revuelta_external_join_requests r0
    WHERE r0.opportunity_id = p_opportunity_id
      AND r0.requester_id = auth.uid()
      AND r0.status IN ('pending', 'accepted')
  );
$$;

REVOKE ALL ON FUNCTION public.revuelta_ext_req_has_blocking_row_for_me(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.revuelta_ext_req_has_blocking_row_for_me(uuid) TO authenticated;

DROP POLICY IF EXISTS revuelta_ext_req_insert_non_member ON public.revuelta_external_join_requests;

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
    AND NOT public.revuelta_ext_req_has_blocking_row_for_me(opportunity_id)
  );
