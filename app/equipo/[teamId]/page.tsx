import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { Crown, Shield } from 'lucide-react'
import { fetchPublicTeamSnapshot } from '@/lib/supabase/public-team-server'
import { isValidTeamInviteId } from '@/lib/team-invite-url'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { Level, Position } from '@/lib/types'

const levelLabels: Record<Level, string> = {
  principiante: 'Principiante',
  intermedio: 'Intermedio',
  avanzado: 'Avanzado',
  competitivo: 'Competitivo',
}

const positionLabels: Record<Position, string> = {
  portero: 'Portero',
  defensa: 'Defensa',
  mediocampista: 'Medio',
  delantero: 'Delantero',
}

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
  params: Promise<{ teamId: string }>
}): Promise<Metadata> {
  const { teamId } = await params
  if (!isValidTeamInviteId(teamId)) {
    return { title: 'Equipo — Pichanga' }
  }
  const team = await fetchPublicTeamSnapshot(teamId)
  return {
    title: team ? `${team.name} — Pichanga` : 'Equipo — Pichanga',
    description: team?.description ?? `Conoce al equipo ${team?.name ?? ''} en Pichanga.`,
  }
}

export default async function EquipoPublicPage({
  params,
}: {
  params: Promise<{ teamId: string }>
}) {
  const { teamId } = await params
  if (!isValidTeamInviteId(teamId)) notFound()

  const [team, loggedIn] = await Promise.all([
    fetchPublicTeamSnapshot(teamId),
    getServerSession(),
  ])

  if (!team) notFound()

  const joinQuery = `joinTeam=${encodeURIComponent(team.id)}`
  const appRoot = '/'

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border px-4 py-4">
        <Link
          href={appRoot}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Pichanga
        </Link>
      </header>

      <main className="mx-auto max-w-lg px-4 py-8 space-y-6">
        <div className="flex gap-4 items-start">
          <div className="w-20 h-20 shrink-0 rounded-2xl bg-muted overflow-hidden flex items-center justify-center">
            {team.logo ? (
              <img
                src={team.logo}
                alt=""
                className="w-full h-full object-cover"
              />
            ) : (
              <Shield className="w-10 h-10 text-primary" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold">{team.name}</h1>
            <div className="flex flex-wrap gap-2 mt-2">
              <Badge variant="secondary">{levelLabels[team.level]}</Badge>
              <span className="text-sm text-muted-foreground">{team.city}</span>
            </div>
          </div>
        </div>

        {team.description ? (
          <p className="text-muted-foreground text-sm leading-relaxed">
            {team.description}
          </p>
        ) : null}

        <div>
          <h2 className="text-lg font-semibold mb-3">Plantilla</h2>
          <div className="space-y-2">
            {team.members.map((m) => (
              <Card key={m.id} className="bg-card border-border">
                <CardContent className="p-3 flex items-center gap-3">
                  <img
                    src={m.photo}
                    alt=""
                    className="w-12 h-12 rounded-full object-cover"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{m.name}</span>
                      {m.isCaptain && (
                        <Crown className="w-4 h-4 text-amber-500 shrink-0" />
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {positionLabels[m.position]}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card/50 p-4 space-y-3">
          <p className="text-sm text-muted-foreground">
            ¿Quieres unirte? Entra con tu cuenta o regístrate; te llevamos al
            equipo en la app.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            {loggedIn ? (
              <Button asChild className="bg-primary hover:bg-primary/90">
                <Link href={`${appRoot}?${joinQuery}`}>Abrir en la app</Link>
              </Button>
            ) : (
              <>
                <Button asChild className="bg-primary hover:bg-primary/90">
                  <Link href={`${appRoot}?${joinQuery}`}>
                    Ya tengo cuenta
                  </Link>
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
