-- ---------------------------------------------------------------------------
-- Promover una cuenta a "centro deportivo" (account_type = venue)
--
-- IMPORTANTE:
-- 1) El usuario debe existir en auth.users (regístralo antes desde la app
--    con "Crear cuenta" O desde Supabase → Authentication → Users).
-- 2) Debe existir fila en public.profiles (la crea el trigger handle_new_user
--    al registrarse; si creaste el usuario solo en el dashboard y NO aparece
--    perfil, ejecuta antes el INSERT de abajo en "Sin perfil").
-- 3) Luego inicia sesión en la app: verás el onboarding del centro y se
--    creará sports_venues al completarlo.
--
-- CONTRASEÑA (no va en SQL):
--   La clave se guarda en Supabase Auth (auth.users), no en public.profiles.
--   - Al registrarte en la app con "Crear cuenta", eliges la contraseña ahí.
--   - O en Dashboard: Authentication → Users → crear usuario / Send recovery.
--   Este script NO crea usuario ni contraseña; solo marca el perfil como venue.
-- ---------------------------------------------------------------------------

-- Opción A: ya tiene perfil (flujo normal tras registrarse en la app)
UPDATE public.profiles
SET account_type = 'venue'
WHERE id = (
  SELECT id FROM auth.users
  WHERE lower(email) = lower('sandamian@gmail.com')
  LIMIT 1
);

-- Opción B: usuario en Auth pero sin fila en profiles (poco frecuente)
/*
INSERT INTO public.profiles (id, name, account_type)
SELECT u.id, 'Centro deportivo', 'venue'::public.account_type
FROM auth.users u
WHERE lower(u.email) = lower('sanlorenzo@gmail.com')
ON CONFLICT (id) DO UPDATE
SET account_type = 'venue';
*/
