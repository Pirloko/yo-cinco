import type { Metadata } from 'next'
import { Oswald } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { Providers } from '@/components/providers'
import { GoogleAnalytics } from '@/components/google-analytics'
import './globals.css'

/** Fuente de marca: sans condensada estilo transmisión / liga (headings y wordmark cortos). */
const brandFont = Oswald({
  subsets: ['latin'],
  variable: '--font-brand',
  weight: '600',
  display: 'swap',
})

/** URL canónica para metadatos absolutos (OG / Twitter). Definir NEXT_PUBLIC_SITE_URL en el hosting. */
const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ||
  'https://www.sportmatch.cl'

const title = 'SPORTMATCH - Encuentra tu partido'
const description =
  'SPORTMATCH: plataforma de matchmaking para fútbol amateur 6 vs 6. Encuentra rivales, jugadores y partidos abiertos en Rancagua.'

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title,
  description,
  generator: 'v0.app',
  icons: {
    icon: [{ url: '/sportmatch-logo.png', type: 'image/png' }],
    apple: '/sportmatch-logo.png',
  },
  openGraph: {
    type: 'website',
    locale: 'es_CL',
    url: siteUrl,
    siteName: 'SPORTMATCH',
    title,
    description,
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
    description,
    images: ['/sportmatch-logo.png'],
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const gaId = process.env.NEXT_PUBLIC_GA_ID?.trim() ?? ''
  const themeBootstrap = `(function(){var k='sportmatch-theme';function setDark(on){document.documentElement.classList.toggle('dark',on);}try{var s=localStorage.getItem(k);if(s==='light')setDark(false);else if(s==='dark')setDark(true);else if(s==='system')setDark(window.matchMedia('(prefers-color-scheme: dark)').matches);else setDark(true);}catch(_){setDark(true);}})();`

  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body
        className={`${brandFont.variable} font-sans antialiased bg-background text-foreground`}
      >
        <GoogleAnalytics measurementId={gaId} />
        <Providers>{children}</Providers>
        {/* Solo Vercel sirve /_vercel/insights — en Netlify provoca 404 en consola */}
        {process.env.VERCEL === '1' ? <Analytics /> : null}
      </body>
    </html>
  )
}
