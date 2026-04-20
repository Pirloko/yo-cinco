'use client'

import { useCallback, useMemo, useState } from 'react'
import { useAppAuth } from '@/lib/app-context'
import type { MatchOpportunity } from '@/lib/types'
import type { OpportunityParticipantRow } from '@/lib/supabase/message-queries'
import { JERSEY_COLOR_PRESETS } from '@/lib/jersey-colors'
import { Button } from '@/components/ui/button'
import { TeamPickShieldShape } from '@/components/team-pick-jersey-color-picker'
import { Loader2 } from 'lucide-react'

type Props = {
  opportunity: MatchOpportunity
  participants: OpportunityParticipantRow[]
  isOrganizer: boolean
  randomizeRevueltaTeams: (
    opportunityId: string,
    colorHexA: string,
    colorHexB: string
  ) => Promise<void>
  /** Vista compacta para el panel del chat */
  compact?: boolean
}

export function RevueltaTeamsPanel({
  opportunity,
  participants,
  isOrganizer,
  randomizeRevueltaTeams,
  compact = false,
}: Props) {
  const { avatarDisplayUrl } = useAppAuth()
  const [colorA, setColorA] = useState<string>(JERSEY_COLOR_PRESETS[0].hex)
  const [colorB, setColorB] = useState<string>(JERSEY_COLOR_PRESETS[2].hex)
  const [busy, setBusy] = useState(false)

  const profileById = useMemo(() => {
    const m = new Map<string, { name: string; photo: string; gk: boolean }>()
    for (const p of participants) {
      m.set(p.id, {
        name: p.name,
        photo: p.photo,
        gk: p.isGoalkeeper === true,
      })
    }
    return m
  }, [participants])

  const joinedParticipants = useMemo(
    () =>
      participants.filter(
        (p) =>
          p.status === 'creator' || p.status === 'confirmed' || p.status === 'pending'
      ),
    [participants]
  )

  const joined = joinedParticipants.length
  const gkCount = useMemo(
    () => joinedParticipants.filter((p) => p.isGoalkeeper === true).length,
    [joinedParticipants]
  )

  if (opportunity.type !== 'open') return null

  const needed = opportunity.playersNeeded ?? 0
  const full = needed > 0 && joined >= needed
  const hasTwoGoalkeepers = gkCount >= 2
  const lineup = opportunity.revueltaLineup

  const handleRandomize = useCallback(() => {
    void (async () => {
      setBusy(true)
      try {
        await randomizeRevueltaTeams(
          opportunity.id,
          colorA,
          colorB
        )
      } finally {
        setBusy(false)
      }
    })()
  }, [randomizeRevueltaTeams, opportunity.id, colorA, colorB])

  const renderTeam = (label: string, userIds: string[], hex: string) => (
    <div className="rounded-xl border border-border bg-secondary/40 p-3 space-y-2">
      <div className="flex items-center gap-3">
        <TeamPickShieldShape
          fill={hex}
          className={
            compact
              ? 'h-10 w-8 shrink-0 drop-shadow-sm'
              : 'h-12 w-9 shrink-0 drop-shadow-md'
          }
        />
        <div className="min-w-0">
          <p className="font-semibold text-foreground text-sm">{label}</p>
          <p className="text-[11px] text-muted-foreground">
            {userIds.length} jugador(es)
          </p>
        </div>
      </div>
      <ul className="space-y-1.5">
        {userIds.map((uid) => {
          const pr = profileById.get(uid)
          return (
            <li
              key={uid}
              className="flex items-center gap-2 text-xs text-foreground"
            >
              <img
                src={avatarDisplayUrl(pr?.photo, uid)}
                alt=""
                className="w-7 h-7 rounded-full object-cover border border-border shrink-0"
              />
              <span className="truncate">
                {pr?.name ?? 'Jugador'}
                {pr?.gk ? ' 🧤' : ''}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )

  return (
    <div
      className={
        compact
          ? 'rounded-lg border border-border bg-card/60 p-3 space-y-3'
          : 'rounded-2xl border border-border bg-card p-4 space-y-4'
      }
    >
      <h3
        className={
          compact
            ? 'text-xs font-semibold text-foreground uppercase tracking-wide'
            : 'font-medium text-foreground'
        }
      >
        Equipos sorteados
      </h3>

      {lineup ? (
        <div
          className={
            compact ? 'grid grid-cols-1 gap-2' : 'grid grid-cols-1 sm:grid-cols-2 gap-3'
          }
        >
          {renderTeam('Equipo A', lineup.teamA.userIds, lineup.teamA.colorHex)}
          {renderTeam('Equipo B', lineup.teamB.userIds, lineup.teamB.colorHex)}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          {full && hasTwoGoalkeepers
            ? isOrganizer
              ? 'Cupos completos. Elige color de camiseta y sortea Equipo A y B.'
              : 'Cuando el organizador sortee, verás los equipos aquí.'
            : full && !hasTwoGoalkeepers
              ? 'Lista completa, pero faltan 2 arqueros para poder sortear.'
            : `Faltan cupos (${joined}/${needed}) para sortear equipos.`}
        </p>
      )}

      {isOrganizer &&
        full &&
        hasTwoGoalkeepers &&
        opportunity.status !== 'completed' && (
        <div className="space-y-3 border-t border-border pt-3">
          {!compact && (
            <p className="text-xs font-medium text-muted-foreground">
              Colores de camiseta
            </p>
          )}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-muted-foreground block mb-1">
                Equipo A
              </label>
              <select
                value={colorA}
                onChange={(e) => setColorA(e.target.value)}
                className="w-full h-9 rounded-md border border-border bg-background px-2 text-xs"
              >
                {JERSEY_COLOR_PRESETS.map((p) => (
                  <option key={p.id} value={p.hex}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground block mb-1">
                Equipo B
              </label>
              <select
                value={colorB}
                onChange={(e) => setColorB(e.target.value)}
                className="w-full h-9 rounded-md border border-border bg-background px-2 text-xs"
              >
                {JERSEY_COLOR_PRESETS.map((p) => (
                  <option key={p.id} value={p.hex}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <Button
            type="button"
            size={compact ? 'sm' : 'default'}
            className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
            disabled={busy}
            onClick={handleRandomize}
          >
            {busy ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Sorteando…
              </>
            ) : lineup ? (
              'Volver a sortear'
            ) : (
              'Sortear equipos al azar'
            )}
          </Button>
          {!compact && (
            <p className="text-[11px] text-muted-foreground">
              Con dos arqueros inscritos, uno queda en cada equipo; el resto se
              reparte al azar.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
