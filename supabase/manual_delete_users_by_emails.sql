-- =============================================================================
-- Eliminar usuarios de prueba por email (Auth + perfil + datos relacionados)
-- =============================================================================
-- ADVERTENCIA: operación IRREVERSIBLE. Ejecutá primero solo el bloque PREVIEW.
--
-- Requisitos:
--   - Ejecutar en Supabase SQL Editor con rol que pueda borrar en `auth.users`
--     (p. ej. conexión como `postgres` / service role en algunos entornos).
--
-- Orden:
--   1) Equipos donde el usuario es capitán → ON DELETE RESTRICT impedía borrar el perfil.
--   2) Filas en `auth.users` → CASCADE borra `public.profiles` y la mayoría de FKs.
--
-- Storage (avatars): Supabase NO permite DELETE directo en `storage.objects` desde SQL
-- (trigger storage.protect_delete). Después de borrar usuarios, limpiá avatares así:
--   - Dashboard → Storage → bucket `profile-avatars` → carpeta = UUID del usuario
--     (o borrá manualmente cada `{uuid}/avatar`), o
--   - API: supabase.storage.from('profile-avatars').remove([`${userId}/avatar`])
--     con la service role key.
--
-- Si falla por otra FK, el mensaje de Postgres indica la tabla; avisame y la agregamos.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) PREVIEW: qué usuarios se van a tocar (ejecutá esto solo, sin el resto)
-- -----------------------------------------------------------------------------
/*
WITH target_emails AS (
  SELECT unnest(
    ARRAY[
      'test@gmail.com',
      'peo1@gmail.com',
      'test10@gmail.com',
      'montegol@gmail.com',
      'etier@gmail.com',
      'carlos@gmail.com',
      '231@gmail.com',
      '2@gmail.com',
      '1@gmail.com'
    ]::text[]
  ) AS email
)
SELECT u.id, u.email, u.created_at
FROM auth.users u
JOIN target_emails te ON lower(trim(u.email)) = lower(trim(te.email))
ORDER BY u.email;
*/

-- -----------------------------------------------------------------------------
-- 1b) Rutas de avatar para borrar luego en Storage (ejecutá antes del borrado;
--     guardá la columna `storage_path` para la UI o la API)
-- -----------------------------------------------------------------------------
/*
SELECT u.id, u.email, u.id::text || '/avatar' AS storage_path
FROM auth.users u
WHERE lower(trim(u.email)) IN (
  lower(trim('test@gmail.com')),
  lower(trim('peo1@gmail.com')),
  lower(trim('test10@gmail.com')),
  lower(trim('montegol@gmail.com')),
  lower(trim('etier@gmail.com')),
  lower(trim('carlos@gmail.com')),
  lower(trim('231@gmail.com')),
  lower(trim('2@gmail.com')),
  lower(trim('1@gmail.com'))
)
ORDER BY u.email;
*/

-- -----------------------------------------------------------------------------
-- 2) BORRADO (descomentá BEGIN/COMMIT o usá transacción en el editor)
-- -----------------------------------------------------------------------------
BEGIN;

CREATE TEMP TABLE _del_users (id uuid PRIMARY KEY) ON COMMIT DROP;

INSERT INTO _del_users (id)
SELECT u.id
FROM auth.users u
WHERE lower(trim(u.email)) IN (
  lower(trim('test@gmail.com')),
  lower(trim('peo1@gmail.com')),
  lower(trim('test10@gmail.com')),
  lower(trim('montegol@gmail.com')),
  lower(trim('etier@gmail.com')),
  lower(trim('carlos@gmail.com')),
  lower(trim('231@gmail.com')),
  lower(trim('2@gmail.com')),
  lower(trim('1@gmail.com'))
);

-- Sin filas: no pasa nada grave
SELECT count(*) AS usuarios_a_eliminar FROM _del_users;

-- Capitanes: borrar el equipo entero (CASCADE limpia miembros, invitaciones, etc.)
DELETE FROM public.teams t
WHERE t.captain_id IN (SELECT id FROM _del_users);

-- Auth: borra usuario; profiles tiene FK a auth.users con ON DELETE CASCADE
DELETE FROM auth.users u
WHERE u.id IN (SELECT id FROM _del_users);

COMMIT;

-- =============================================================================
-- Notas
-- =============================================================================
-- - Si algún email no existe, simplemente no se borra nada para ese caso.
-- - Logos de equipos en `team-logos` pueden quedar huérfanos; limpiar desde Storage UI/API.
-- - Avatares huérfanos en `profile-avatars`: ver nota arriba (no usar SQL sobre storage.objects).
-- =============================================================================
