import type { Metadata } from 'next'

import {
  VENUE_B2B_SEO_DESCRIPTION,
  VENUE_B2B_SEO_KEYWORDS,
} from '@/lib/venue-b2b-marketing'

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ||
  'https://www.sportmatch.cl'

const title = 'Centros deportivos · SPORTMATCH'

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: title,
  description: VENUE_B2B_SEO_DESCRIPTION,
  url: `${siteUrl}/para-centros`,
  inLanguage: 'es-CL',
  isPartOf: {
    '@type': 'WebSite',
    name: 'SPORTMATCH',
    url: siteUrl,
  },
} as const

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    absolute: title,
  },
  description: VENUE_B2B_SEO_DESCRIPTION,
  keywords: [...VENUE_B2B_SEO_KEYWORDS],
  alternates: {
    canonical: '/para-centros',
  },
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    type: 'website',
    locale: 'es_CL',
    url: '/para-centros',
    siteName: 'SPORTMATCH',
    title,
    description: VENUE_B2B_SEO_DESCRIPTION,
    images: [
      {
        url: '/sportmatch-logo.png',
        width: 1181,
        height: 1653,
        alt: 'SPORTMATCH',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description: VENUE_B2B_SEO_DESCRIPTION,
    images: ['/sportmatch-logo.png'],
  },
}

export default function ParaCentrosLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {children}
    </>
  )
}
