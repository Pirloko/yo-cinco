-- Evita NULL en is_goalkeeper para team_pick cuando encounter_lineup_role venga null.

CREATE OR REPLACE FUNCTION public.sync_encounter_lineup_goalkeeper_flag()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  mo_type public.match_type;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  SELECT type INTO mo_type
  FROM public.match_opportunities
  WHERE id = NEW.opportunity_id;

  IF mo_type IS NULL
    OR mo_type NOT IN (
      'team_pick_public'::public.match_type,
      'team_pick_private'::public.match_type
    )
  THEN
    RETURN NEW;
  END IF;

  NEW.is_goalkeeper := COALESCE(NEW.encounter_lineup_role = 'gk', false);
  RETURN NEW;
END;
$$;
