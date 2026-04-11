/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  /**
   * Optimización en servidor (WebP/AVIF, tamaños según `sizes` + viewport).
   * Los assets en `public/*.webp` ya están redimensionados para menos trabajo en cold.
   */
  images: {
    formats: ['image/avif', 'image/webp'],
  },
}

export default nextConfig
