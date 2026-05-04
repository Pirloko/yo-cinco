import { VenueB2bPublicPage } from '@/components/venue-b2b-public-page'
import {
  buildVenueB2bWhatsAppHref,
  VENUE_B2B_WHATSAPP_PREFILL_MESSAGE,
} from '@/lib/venue-b2b-marketing'

export default function ParaCentrosPage() {
  const whatsappHref = buildVenueB2bWhatsAppHref(
    VENUE_B2B_WHATSAPP_PREFILL_MESSAGE,
  )

  return <VenueB2bPublicPage whatsappHref={whatsappHref} />
}
