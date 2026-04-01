/** Origen canónico del sitio en el servidor (SEO, JSON-LD, sitemap). */
export function getSeoSiteOrigin(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ??
    'https://www.sportmatch.cl'
  )
}
