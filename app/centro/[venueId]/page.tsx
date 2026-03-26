import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { MapPin } from 'lucide-react'
import { isValidTeamInviteId } from '@/lib/team-invite-url'
import { fetchPublicVenuePageData } from '@/lib/supabase/public-venue-server'
import { VenueCentroClient } from '@/components/venue-centro-client'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ venueId: string }>
}): Promise<Metadata> {
  const { venueId } = await params
  if (!isValidTeamInviteId(venueId)) {
    return { title: 'Centro — Pichanga' }
  }
  const data = await fetchPublicVenuePageData(venueId)
  return {
    title: data ? `${data.venue.name} — Pichanga` : 'Centro — Pichanga',
    description: data
      ? `Reserva y partidos en ${data.venue.name}, ${data.venue.city}.`
      : undefined,
  }
}

export default async function CentroPublicPage({
  params,
}: {
  params: Promise<{ venueId: string }>
}) {
  const { venueId } = await params
  if (!isValidTeamInviteId(venueId)) notFound()

  const data = await fetchPublicVenuePageData(venueId)
  if (!data) notFound()

  const { venue, courts, weeklyHours } = data

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border px-4 py-4">
        <Link
          href="/"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Pichanga
        </Link>
      </header>

      <main className="mx-auto max-w-lg px-4 py-8 space-y-6">
        <div className="flex gap-4 items-start">
          <div className="w-16 h-16 shrink-0 rounded-2xl bg-primary/15 flex items-center justify-center">
            <MapPin className="w-8 h-8 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold">{venue.name}</h1>
            <p className="text-sm text-muted-foreground mt-1">{venue.city}</p>
          </div>
        </div>

        <VenueCentroClient venue={venue} courts={courts} weeklyHours={weeklyHours} />
      </main>
    </div>
  )
}
