-- ---------------------------------------------------------------------------
-- Promover una cuenta a administrador (account_type = admin)
--
-- Requiere migración que añada el valor 'admin' al enum account_type
-- (p. ej. 20260327001000_admin_and_self_confirmed_reservations.sql).
--
-- 1) El usuario debe existir en auth.users (registro previo en la app o
--    Supabase → Authentication → Users).
-- 2) Debe existir fila en public.profiles (trigger handle_new_user al
--    registrarse; si falta, usa el bloque comentado más abajo).
-- ---------------------------------------------------------------------------

UPDATE public.profiles
SET account_type = 'admin'::public.account_type
WHERE id = (
  SELECT id FROM auth.users
  WHERE lower(email) = lower('admin@gmail.com')
  LIMIT 1
);

-- Si el usuario existe en Auth pero no tiene perfil:
/*
INSERT INTO public.profiles (id, name, account_type)
SELECT u.id, coalesce(u.raw_user_meta_data->>'name', 'Admin'), 'admin'::public.account_type
FROM auth.users u
WHERE lower(u.email) = lower('admin@gmail.com')
ON CONFLICT (id) DO UPDATE
SET account_type = 'admin'::public.account_type;
*/
