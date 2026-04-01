-- Organizador: cerrar partido tipo rival con resultado (misma idea que finalize_revuelta_match).

CREATE OR REPLACE FUNCTION public.finalize_rival_match(
  p_opportunity_id uuid,
  p_result public.rival_result
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  mo RECORD;
  rc RECORD;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'auth_required';
  END IF;

  SELECT * INTO mo FROM public.match_opportunities WHERE id = p_opportunity_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found';
  END IF;
  IF mo.creator_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'not_organizer';
  END IF;
  IF mo.type IS DISTINCT FROM 'rival'::public.match_type THEN
    RAISE EXCEPTION 'not_rival';
  END IF;
  IF mo.status = 'completed'::public.match_status THEN
    RAISE EXCEPTION 'already_completed';
  END IF;
  IF mo.status = 'cancelled'::public.match_status THEN
    RAISE EXCEPTION 'already_cancelled';
  END IF;
  IF mo.rival_outcome_disputed IS TRUE THEN
    RAISE EXCEPTION 'disputed_use_override';
  END IF;

  SELECT * INTO rc FROM public.rival_challenges WHERE opportunity_id = p_opportunity_id;
  IF NOT FOUND OR rc.status IS DISTINCT FROM 'accepted'::public.rival_challenge_status THEN
    RAISE EXCEPTION 'challenge_not_accepted';
  END IF;

  UPDATE public.match_opportunities
  SET
    rival_result = p_result,
    status = 'completed'::public.match_status,
    finalized_at = now(),
    rival_outcome_disputed = false,
    updated_at = now()
  WHERE id = p_opportunity_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.finalize_rival_match(uuid, public.rival_result) TO authenticated;
