'use client'

import Script from 'next/script'
import { usePathname } from 'next/navigation'
import { useEffect } from 'react'

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void
  }
}

type Props = {
  measurementId: string
}

export function GoogleAnalytics({ measurementId }: Props) {
  const pathname = usePathname()

  useEffect(() => {
    if (
      !measurementId ||
      typeof window === 'undefined' ||
      typeof window.gtag !== 'function'
    ) {
      return
    }
    const pagePath = `${pathname}${window.location.search ?? ''}`
    window.gtag('config', measurementId, { page_path: pagePath })
  }, [measurementId, pathname])

  if (!measurementId) return null

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`}
        strategy="afterInteractive"
      />
      <Script id="google-analytics" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          window.gtag = gtag;
          gtag('js', new Date());
          gtag('config', '${measurementId}', { send_page_view: false });
        `}
      </Script>
    </>
  )
}
