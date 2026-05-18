# Pichanga

App web (Next.js + Supabase) para buscar rivales, jugadores y revueltas de fútbol amateur.

## Requisitos

- [Node.js](https://nodejs.org/) 20 o superior
- Cuenta en [Supabase](https://supabase.com/) con el proyecto configurado y migraciones aplicadas (`supabase/migrations/`)

## Desarrollo local

```bash
npm install
cp .env.example .env.local
# Edita .env.local con NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000).

## Subir el código a GitHub

1. Crea un repositorio vacío en GitHub (sin README si ya tienes uno en el proyecto).
2. En la carpeta del proyecto:

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/TU_REPO.git
git push -u origin main
```

Sustituye la URL por la de tu repositorio.

## Desplegar en Netlify

1. En [Netlify](https://www.netlify.com/): **Add new site** → **Import an existing project** → conecta GitHub y elige este repositorio.
2. Deja los valores por defecto que lee de `netlify.toml` (build: `npm run build`, plugin Next.js).
3. En **Site settings → Environment variables**, añade las mismas variables que en `.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_SITE_URL` = la URL canónica del sitio en producción (ej. `https://tu-app.netlify.app`), **sin** `localhost`
4. Si usas `SUPABASE_SERVICE_ROLE_KEY` en rutas de servidor, añádela solo en Netlify (nunca como `NEXT_PUBLIC_*`).
5. **Deploy site**. Tras cada push a `main`, Netlify volverá a construir y desplegar.

### Dominio y Supabase

- En Supabase → **Authentication** → **URL configuration**:
  - **Site URL**: la URL canónica exacta (ej. `https://www.sportmatch.cl`). Debe ser la misma que uses en el navegador y en `NEXT_PUBLIC_SITE_URL`.
  - **Redirect URLs** (todas las variantes que uses; `www` y sin `www` son dominios distintos):
    - `https://www.sportmatch.cl`
    - `https://www.sportmatch.cl/**`
    - `https://sportmatch.cl` y `https://sportmatch.cl/**` (si aún entran sin `www`; ideal redirigir apex → `www` en el hosting)
    - `http://localhost:3000/**` (desarrollo)
    - Deep links móvil si aplica (`sportmatch://auth/callback`, etc.)
  - En Netlify/Vercel define `NEXT_PUBLIC_SITE_URL=https://www.sportmatch.cl` (sin barra final).
- Si el login con Google funciona al **segundo** intento: suele ser retorno OAuth con `code` en la URL antes de que la app lea la sesión, o **Redirect URL** solo con `sportmatch.cl` mientras entras por `www.sportmatch.cl`.

## Scripts

| Comando        | Descripción        |
|----------------|--------------------|
| `npm run dev`  | Servidor desarrollo |
| `npm run build`| Compilación producción |
| `npm run start`| Servidor producción (tras build) |
| `npm run lint` | ESLint (si está configurado) |

## Licencia

Privado / según definas en el repositorio.
