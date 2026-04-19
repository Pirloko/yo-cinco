-- Valores nuevos de match_type en transacción propia (commit antes de usarlos en otra migración).
-- Ver: https://www.postgresql.org/docs/current/sql-altertype.html — no usar el valor nuevo
-- en la misma transacción que lo añade.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'match_type' AND e.enumlabel = 'team_pick_public'
  ) THEN
    ALTER TYPE public.match_type ADD VALUE 'team_pick_public';
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'match_type' AND e.enumlabel = 'team_pick_private'
  ) THEN
    ALTER TYPE public.match_type ADD VALUE 'team_pick_private';
  END IF;
END
$$;
