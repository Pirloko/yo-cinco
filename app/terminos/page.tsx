import type { Metadata } from 'next'

import { LegalPublicDocument } from '@/components/legal-public-document'
import { getSeoSiteOrigin } from '@/lib/seo/site-origin'

const PATH = '/terminos'

export const revalidate = 86400

export async function generateMetadata(): Promise<Metadata> {
  const base = getSeoSiteOrigin()
  const canonical = `${base}${PATH}`
  const title = 'Términos de Uso — SportMatch'
  const description =
    'Términos y condiciones de uso de SportMatch (app web y móvil). Reglas del servicio, cuentas, partidos y responsabilidades.'

  return {
    title,
    description,
    alternates: { canonical },
    robots: { index: true, follow: true },
    openGraph: {
      title,
      description,
      url: canonical,
      locale: 'es_CL',
      type: 'website',
    },
  }
}

export default function TerminosPage() {
  return (
    <LegalPublicDocument
      documentId="terms"
      pageTitle="Términos de Uso — SportMatch"
      otherPage={{ href: '/privacidad', label: 'Política de privacidad' }}
    />
  )
}
