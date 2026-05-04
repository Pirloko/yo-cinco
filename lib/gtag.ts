/**
 * Eventos GA4 (gtag) cuando existe `NEXT_PUBLIC_GA_ID` y el script de GoogleAnalytics está cargado.
 * Sin impacto si gtag no está en window.
 */

declare global {
  interface Window {
    gtag?: (
      command: 'event' | 'config' | 'js',
      target: string | Date,
      config?: Record<string, unknown>
    ) => void
  }
}

export const SPORTMATCH_GA_EVENTS = {
  venueB2bNavClick: 'venue_b2b_nav_click',
  venueB2bWhatsappClick: 'venue_b2b_whatsapp_click',
} as const

export function trackSportmatchEvent(
  eventName: string,
  params?: Record<string, string | number | boolean | undefined>
): void {
  if (typeof window === 'undefined') return
  const gtag = window.gtag
  if (typeof gtag !== 'function') return
  const payload = Object.fromEntries(
    Object.entries(params ?? {}).filter(
      ([, v]) => v !== undefined && v !== ''
    )
  )
  gtag('event', eventName, payload)
}
