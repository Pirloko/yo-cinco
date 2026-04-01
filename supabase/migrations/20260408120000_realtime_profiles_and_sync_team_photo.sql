-- Realtime: cambios de foto/nombre en perfiles visibles en la app sin recargar.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'profiles'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
  END IF;
END $$;

-- Mantener team_members.photo_url alineado con el perfil (la UI prioriza profiles, pero otras consultas quedan coherentes).
CREATE OR REPLACE FUNCTION public.sync_team_member_photo_from_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.photo_url IS DISTINCT FROM OLD.photo_url THEN
    UPDATE public.team_members
    SET photo_url = NEW.photo_url
    WHERE user_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_team_member_photo_from_profile ON public.profiles;
CREATE TRIGGER trg_sync_team_member_photo_from_profile
  AFTER UPDATE OF photo_url ON public.profiles
  FOR EACH ROW
  EXECUTE PROCEDURE public.sync_team_member_photo_from_profile();
