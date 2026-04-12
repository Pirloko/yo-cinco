/** @type {import('next').NextConfig} */

/** Buckets públicos (team-logos, avatares, etc.) vía `next/image` con src absoluto. */
function supabaseStorageRemotePattern() {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!raw) return null
  try {
    const u = new URL(raw)
    return {
      protocol: u.protocol.replace(':', ''),
      hostname: u.hostname,
      pathname: '/storage/v1/object/public/**',
    }
  } catch {
    return null
  }
}

const supabasePattern = supabaseStorageRemotePattern()

/** Avatares / placeholders externos vía `next/image` (p. ej. Unsplash en mocks). */
const unsplashPattern = {
  protocol: 'https',
  hostname: 'images.unsplash.com',
  pathname: '/**',
}

const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  /**
   * Optimización en servidor (WebP/AVIF, tamaños según `sizes` + viewport).
   * Los assets en `public/*.webp` ya están redimensionados para menos trabajo en cold.
   * `remotePatterns`: Storage público de Supabase + hosts de imágenes externas permitidas.
   */
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      ...(supabasePattern ? [supabasePattern] : []),
      unsplashPattern,
    ],
  },
}

export default nextConfig
