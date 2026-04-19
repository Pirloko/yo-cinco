import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { formatMatchInTimezone } from '@/lib/match-datetime-format'
import { fetchPublicRevueltaSnapshot } from '@/lib/supabase/public-revuelta-server'
import {
  TEAM_PICK_MAX_FIELD_PER_SIDE,
  TEAM_PICK_MAX_GK_PER_SIDE,
  teamPickLineupSummary,
  teamPickSlotsFromParticipants,
} from '@/lib/team-pick-ui'
import { isValidOpportunityInviteId } from '@/lib/match-invite-url'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

export const revalidate = 60

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
  const titlePrefix =
    snap?.type === 'team_pick_public' ? `${snap.title} (6vs6)` : snap?.title
  return {
    title: titlePrefix ? `${titlePrefix} — SPORTMATCH` : 'Revuelta — SPORTMATCH',
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
  const isTeamPickPublic = snap.type === 'team_pick_public'

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
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <Badge variant="outline">
              {isTeamPickPublic ? '6vs6 · cupos públicos' : 'Revuelta abierta'}
            </Badge>
            {isTeamPickPublic &&
            snap.teamPickColorA &&
            snap.teamPickColorB ? (
              <span
                className="flex items-center gap-1.5"
                title="Colores equipo A y B"
              >
                <span
                  className="h-3 w-3 rounded-full border border-border"
                  style={{ backgroundColor: snap.teamPickColorA }}
                />
                <span
                  className="h-3 w-3 rounded-full border border-border"
                  style={{ backgroundColor: snap.teamPickColorB }}
                />
              </span>
            ) : null}
          </div>
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
          {!isTeamPickPublic ? (
            <p>
              Arqueros:{' '}
              <span className="text-foreground">
                {snap.goalkeeperCount}/2
              </span>
              {gkLeft > 0 ? ` · ${gkLeft} cupo(s) arquero` : ' · Completo'}
            </p>
          ) : (
            <div className="space-y-2">
              <p className="text-muted-foreground">
                En la app elegís equipo (A o B) y rol para este encuentro.
              </p>
              <p className="text-xs text-foreground/90 flex flex-wrap gap-x-4 gap-y-1">
                {(() => {
                  const slots = teamPickSlotsFromParticipants(
                    snap.participants.map((p) => ({
                      status: p.isCreator ? 'creator' : 'confirmed',
                      pickTeam: p.pickTeam,
                      encounterLineupRole: p.encounterLineupRole,
                      isGoalkeeper: p.isGoalkeeper,
                    }))
                  )
                  const ca = snap.teamPickColorA ?? '#16a34a'
                  const cb = snap.teamPickColorB ?? '#2563eb'
                  return (
                    <>
                      <span className="inline-flex items-center gap-1.5 tabular-nums">
                        <span
                          className="h-2 w-2 rounded-full border border-border shrink-0"
                          style={{ backgroundColor: ca }}
                        />
                        Equipo A: {slots.A.gk}/{TEAM_PICK_MAX_GK_PER_SIDE} GK ·{' '}
                        {slots.A.field}/{TEAM_PICK_MAX_FIELD_PER_SIDE} campo
                      </span>
                      <span className="inline-flex items-center gap-1.5 tabular-nums">
                        <span
                          className="h-2 w-2 rounded-full border border-border shrink-0"
                          style={{ backgroundColor: cb }}
                        />
                        Equipo B: {slots.B.gk}/{TEAM_PICK_MAX_GK_PER_SIDE} GK ·{' '}
                        {slots.B.field}/{TEAM_PICK_MAX_FIELD_PER_SIDE} campo
                      </span>
                    </>
                  )
                })()}
              </p>
            </div>
          )}
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-3">Quién va</h2>
          <div className="space-y-2">
            {snap.participants.map((p) => {
              const teamPickLine =
                isTeamPickPublic &&
                (teamPickLineupSummary(p.pickTeam, p.encounterLineupRole) ||
                  'Aún sin bando / rol')
              return (
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
                        {!isTeamPickPublic && p.isGoalkeeper ? ' 🧤' : ''}
                      </span>
                      {p.isCreator && (
                        <p className="text-xs text-muted-foreground">Organizador</p>
                      )}
                      {typeof teamPickLine === 'string' ? (
                        <p className="text-xs text-muted-foreground">{teamPickLine}</p>
                      ) : !p.isCreator && p.isGoalkeeper ? (
                        <p className="text-xs text-muted-foreground">Arquero</p>
                      ) : !p.isCreator && !p.isGoalkeeper ? (
                        <p className="text-xs text-muted-foreground">
                          Jugador de campo
                        </p>
                      ) : null}
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card/50 p-4 space-y-3">
          <p className="text-sm text-muted-foreground">
            {isTeamPickPublic
              ? 'Entra con tu cuenta para unirte al 6vs6 y definir equipo y rol antes del partido.'
              : 'Entra con tu cuenta para unirte y elegir si vas de arquero o de campo.'}
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
