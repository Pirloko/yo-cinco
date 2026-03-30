import type { Metadata } from 'next'
import { Geist, Geist_Mono, Nunito } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { Providers } from '@/components/providers'
import './globals.css'

const _geist = Geist({ subsets: ['latin'] })
const _geistMono = Geist_Mono({ subsets: ['latin'] })

/** Sans redondeada (marca / wordmark) — alineada con referencia tipo Nunito / Varela Round */
const brandRound = Nunito({
  subsets: ['latin'],
  variable: '--font-brand-round',
  weight: ['700', '800'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'SPORTMATCH - Encuentra tu partido',
  description:
    'SPORTMATCH: plataforma de matchmaking para fútbol amateur 6 vs 6. Encuentra rivales, jugadores y partidos abiertos en Rancagua.',
  generator: 'v0.app',
  icons: {
    icon: [{ url: '/sportmatch-logo.png', type: 'image/png' }],
    apple: '/sportmatch-logo.png',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const themeBootstrap = `(function(){var k='sportmatch-theme';function setDark(on){document.documentElement.classList.toggle('dark',on);}try{var s=localStorage.getItem(k);if(s==='light')setDark(false);else if(s==='dark')setDark(true);else if(s==='system')setDark(window.matchMedia('(prefers-color-scheme: dark)').matches);else setDark(true);}catch(_){setDark(true);}})();`

  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body
        className={`${brandRound.variable} font-sans antialiased bg-background text-foreground`}
      >
        <Providers>{children}</Providers>
        {/* Solo Vercel sirve /_vercel/insights — en Netlify provoca 404 en consola */}
        {process.env.VERCEL === '1' ? <Analytics /> : null}
      </body>
    </html>
  )
}
