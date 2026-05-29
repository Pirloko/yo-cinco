import type { Metadata } from 'next'

import { LegalPublicDocument } from '@/components/legal-public-document'
import { getSeoSiteOrigin } from '@/lib/seo/site-origin'

const PATH = '/privacidad'

export const revalidate = 86400

export async function generateMetadata(): Promise<Metadata> {
  const base = getSeoSiteOrigin()
  const canonical = `${base}${PATH}`
  const title = 'Política de Privacidad — SportMatch'
  const description =
    'Política de privacidad de SportMatch (app web y móvil). Información sobre datos personales, Supabase, Google y tus derechos en Chile.'

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

export default function PrivacidadPage() {
  return (
    <LegalPublicDocument
      documentId="privacy"
      pageTitle="Política de Privacidad — SportMatch"
      otherPage={{ href: '/terminos', label: 'Términos de uso' }}
    />
  )
}
