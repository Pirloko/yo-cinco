import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { formatMatchInTimezone } from '@/lib/match-datetime-format'
import { CACHE_REVALIDATE_SECONDS } from '@/lib/cache-policy'
import { fetchPublicRevueltaSnapshot } from '@/lib/supabase/public-revuelta-server'
import { isValidOpportunityInviteId } from '@/lib/match-invite-url'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

export const revalidate = CACHE_REVALIDATE_SECONDS.publicDynamic

async function getServerSession(): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return false
  const cookieStore = await cookies()
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll() {},
    },
  })
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return !!user
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ opportunityId: string }>
}): Promise<Metadata> {
  const { opportunityId } = await params
  if (!isValidOpportunityInviteId(opportunityId)) {
    return { title: 'Revuelta — SPORTMATCH' }
  }
  const snap = await fetchPublicRevueltaSnapshot(opportunityId)
  return {
    title: snap ? `${snap.title} — SPORTMATCH` : 'Revuelta — SPORTMATCH',
    description: snap?.description,
  }
}

export default async function RevueltaPublicPage({
  params,
}: {
  params: Promise<{ opportunityId: string }>
}) {
  const { opportunityId } = await params
  if (!isValidOpportunityInviteId(opportunityId)) notFound()

  const [snap, loggedIn] = await Promise.all([
    fetchPublicRevueltaSnapshot(opportunityId),
    getServerSession(),
  ])

  if (!snap) notFound()

  const dt = new Date(snap.dateTimeIso)
  const joinQuery = `joinMatch=${encodeURIComponent(snap.id)}`
  const appRoot = '/'
  const needed = snap.playersNeeded
  const joined = snap.playersJoined
  const left = Math.max(0, needed - joined)
  const gkLeft = Math.max(0, 2 - snap.goalkeeperCount)

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border px-4 py-4">
        <Link
          href={appRoot}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← SPORTMATCH
        </Link>
      </header>

      <main className="mx-auto max-w-lg px-4 py-8 space-y-6">
        <div>
          <Badge variant="outline" className="mb-2">
            Revuelta abierta
          </Badge>
          <h1 className="text-2xl font-bold">{snap.title}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {snap.venue}, {snap.location}
          </p>
        </div>

        {snap.description ? (
          <p className="text-muted-foreground text-sm">{snap.description}</p>
        ) : null}

        <div className="text-sm space-y-1 text-muted-foreground">
          <p>
            <span className="text-foreground font-medium">
              {formatMatchInTimezone(dt, "EEEE d 'de' MMMM")}
            </span>
          </p>
          <p>{formatMatchInTimezone(dt, 'HH:mm')} hrs</p>
          <p>
            Cupos:{' '}
            <span className="text-foreground">
              {joined}/{needed} jugadores
            </span>
            {left > 0 ? ` · ${left} libre(s)` : ' · Completo'}
          </p>
          <p>
            Arqueros:{' '}
            <span className="text-foreground">
              {snap.goalkeeperCount}/2
            </span>
            {gkLeft > 0 ? ` · ${gkLeft} cupo(s) arquero` : ' · Completo'}
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-3">Quién va</h2>
          <div className="space-y-2">
            {snap.participants.map((p) => (
              <Card key={p.id} className="bg-card border-border">
                <CardContent className="p-3 flex items-center gap-3">
                  <img
                    src={p.photo}
                    alt=""
                    className="w-10 h-10 rounded-full object-cover"
                  />
                  <div className="flex-1 min-w-0">
                    <span className="font-medium">
                      {p.name}
                      {p.isGoalkeeper ? ' 🧤' : ''}
                    </span>
                    {p.isCreator && (
                      <p className="text-xs text-muted-foreground">Organizador</p>
                    )}
                    {!p.isCreator && p.isGoalkeeper && (
                      <p className="text-xs text-muted-foreground">Arquero</p>
                    )}
                    {!p.isCreator && !p.isGoalkeeper && (
                      <p className="text-xs text-muted-foreground">
                        Jugador de campo
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card/50 p-4 space-y-3">
          <p className="text-sm text-muted-foreground">
            Entra con tu cuenta para unirte y elegir si vas de arquero o de
            campo.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            {loggedIn ? (
              <Button asChild className="bg-primary hover:bg-primary/90">
                <Link href={`${appRoot}?${joinQuery}`}>Abrir en la app</Link>
              </Button>
            ) : (
              <>
                <Button asChild className="bg-primary hover:bg-primary/90">
                  <Link href={`${appRoot}?${joinQuery}`}>Ya tengo cuenta</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href={`${appRoot}?${joinQuery}&register=1`}>
                    Crear cuenta
                  </Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
