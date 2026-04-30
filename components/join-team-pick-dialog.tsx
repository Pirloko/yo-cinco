'use client'

import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type {
  EncounterLineupRole,
  MatchOpportunity,
  PickTeamSide,
} from '@/lib/types'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { JoinPayOrganizerNotice } from '@/components/match-court-pricing'
import {
  TEAM_PICK_MAX_FIELD_PER_SIDE,
  TEAM_PICK_MAX_GK_PER_SIDE,
  teamPickAccentBorderForOutline,
  teamPickColorsForUi,
  teamPickContrastForeground,
  teamPickSideIsFull,
  teamPickSlotsFromParticipants,
} from '@/lib/team-pick-ui'
import { cn } from '@/lib/utils'
import { useAppAuth } from '@/lib/app-context'
import { getBrowserSupabase, isSupabaseConfigured } from '@/lib/supabase/client'
import { fetchParticipantsForOpportunity } from '@/lib/supabase/message-queries'
import { queryKeys } from '@/lib/query-keys'
import { sessionQueryEnabled } from '@/lib/query-session-enabled'

const ROLES: { value: EncounterLineupRole; label: string }[] = [
  { value: 'gk', label: 'Arquero' },
  { value: 'defensa', label: 'Defensa' },
  { value: 'mediocampista', label: 'Mediocampista' },
  { value: 'delantero', label: 'Delantero' },
]

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  opportunity: MatchOpportunity | null
  /** Si el usuario ya ingresó el código afuera (p. ej. buscar por código en inicio). */
  fixedJoinCode?: string | null
  onJoin: (payload: {
    pickTeam: PickTeamSide
    encounterLineupRole: EncounterLineupRole
    joinCode?: string
  }) => Promise<void>
}

export function JoinTeamPickDialog({
  open,
  onOpenChange,
  opportunity,
  fixedJoinCode = null,
  onJoin,
}: Props) {
  const { currentUser } = useAppAuth()
  const [pickTeam, setPickTeam] = useState<PickTeamSide>('A')
  const [role, setRole] = useState<EncounterLineupRole>('delantero')
  const [joinCode, setJoinCode] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const oppId = opportunity?.id ?? ''

  const participantsQuery = useQuery({
    queryKey: queryKeys.matchOpportunity.participants(oppId ? oppId : null),
    enabled:
      open &&
      Boolean(oppId) &&
      sessionQueryEnabled(currentUser?.id) &&
      isSupabaseConfigured(),
    queryFn: async () => {
      const sb = getBrowserSupabase()
      if (!sb || !oppId) return []
      return fetchParticipantsForOpportunity(sb, oppId)
    },
  })

  const slots = useMemo(
    () => teamPickSlotsFromParticipants(participantsQuery.data ?? []),
    [participantsQuery.data]
  )

  useEffect(() => {
    if (!open) {
      setPickTeam('A')
      setRole('delantero')
      setJoinCode('')
      setSubmitting(false)
    }
  }, [open])

  useEffect(() => {
    if (!open || !participantsQuery.isSuccess) return
    const s = slots[pickTeam]
    if (role === 'gk' && s.gk >= TEAM_PICK_MAX_GK_PER_SIDE) {
      setRole('delantero')
      return
    }
    if (
      role !== 'gk' &&
      s.field >= TEAM_PICK_MAX_FIELD_PER_SIDE &&
      s.gk < TEAM_PICK_MAX_GK_PER_SIDE
    ) {
      setRole('gk')
    }
  }, [open, participantsQuery.isSuccess, pickTeam, role, slots])

  if (!opportunity) return null

  const { colorA, colorB } = teamPickColorsForUi(opportunity)

  const lockedCode = (fixedJoinCode ?? '').trim()
  const isPrivate = opportunity.type === 'team_pick_private'
  const needsCodeInput = isPrivate && lockedCode.length !== 4
  const codeOk =
    !isPrivate ||
    lockedCode.length === 4 ||
    /^[0-9]{4}$/.test(joinCode.trim())

  const loadingSlots = participantsQuery.isPending
  const slotsError = participantsQuery.isError
  const slotsReady = participantsQuery.isSuccess

  const sideFull = teamPickSideIsFull(slots[pickTeam])
  const gkTakenOnSide = slots[pickTeam].gk >= TEAM_PICK_MAX_GK_PER_SIDE
  const fieldFullOnSide = slots[pickTeam].field >= TEAM_PICK_MAX_FIELD_PER_SIDE
  const roleChoiceValid =
    role === 'gk' ? !gkTakenOnSide : !fieldFullOnSide

  const bothSidesFull =
    teamPickSideIsFull(slots.A) && teamPickSideIsFull(slots.B)

  const canSubmit =
    codeOk &&
    !submitting &&
    slotsReady &&
    !slotsError &&
    !loadingSlots &&
    !sideFull &&
    roleChoiceValid &&
    !bothSidesFull

  const handleSubmit = async () => {
    if (!canSubmit) return
    setSubmitting(true)
    try {
      const codeOut =
        isPrivate ? (lockedCode.length === 4 ? lockedCode : joinCode.trim()) : undefined
      await onJoin({
        pickTeam,
        encounterLineupRole: role,
        joinCode: codeOut,
      })
      onOpenChange(false)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Unirme a selección de equipos</DialogTitle>
          <DialogDescription>
            Elige equipo A o B y tu rol. El máximo es 6 por equipo (1 arquero y 5 de campo).
            {isPrivate
              ? ' Este partido es privado: necesitas el código de 4 dígitos que te comparta el organizador.'
              : null}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="rounded-lg border border-border bg-secondary/30 px-3 py-2.5 space-y-2 text-xs">
            <p className="font-medium text-[11px] uppercase tracking-wide text-muted-foreground">
              Cupos por equipo
            </p>
            {loadingSlots ? (
              <p className="text-muted-foreground">Cargando cupos…</p>
            ) : slotsError ? (
              <p className="text-amber-700 dark:text-amber-300 leading-snug">
                No pudimos cargar los cupos. Cierra y vuelve a abrir, o inténtalo de nuevo más tarde.
              </p>
            ) : bothSidesFull ? (
              <p className="text-muted-foreground">Los dos equipos ya están completos.</p>
            ) : (
              (['A', 'B'] as const).map((side) => {
                const s = slots[side]
                const color = side === 'A' ? colorA : colorB
                const full = teamPickSideIsFull(s)
                return (
                  <div
                    key={side}
                    className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1"
                  >
                    <span className="flex items-center gap-1.5 font-medium text-foreground">
                      <span
                        className="h-2.5 w-2.5 rounded-full border border-border shrink-0"
                        style={{ backgroundColor: color }}
                      />
                      Equipo {side}
                      {full ? (
                        <span className="text-[10px] font-normal text-muted-foreground">
                          (completo)
                        </span>
                      ) : null}
                    </span>
                    <span className="text-muted-foreground tabular-nums">
                      Arquero {s.gk}/{TEAM_PICK_MAX_GK_PER_SIDE} · Campo{' '}
                      {s.field}/{TEAM_PICK_MAX_FIELD_PER_SIDE}
                    </span>
                  </div>
                )
              })
            )}
          </div>

          {isPrivate && needsCodeInput ? (
            <div className="space-y-2">
              <Label htmlFor="team-pick-code">Código de acceso</Label>
              <Input
                id="team-pick-code"
                inputMode="numeric"
                maxLength={4}
                autoComplete="one-time-code"
                placeholder="0000"
                value={joinCode}
                onChange={(e) =>
                  setJoinCode(e.target.value.replace(/\D/g, '').slice(0, 4))
                }
                className="h-12 tracking-widest text-center text-lg font-mono"
              />
              {!codeOk && joinCode.length > 0 ? (
                <p className="text-xs text-destructive">Ingresa los 4 dígitos.</p>
              ) : null}
            </div>
          ) : isPrivate && lockedCode.length === 4 ? (
            <p className="text-xs text-muted-foreground rounded-lg border border-border bg-secondary/40 px-3 py-2">
              Código <span className="font-mono font-semibold tracking-widest">{lockedCode}</span>{' '}
              confirmado. Elige equipo y rol.
            </p>
          ) : null}

          <div className="space-y-2">
            <Label>Equipo</Label>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  ['A', 'Equipo A'] as const,
                  ['B', 'Equipo B'] as const,
                ] as const
              ).map(([side, label]) => {
                const full = teamPickSideIsFull(slots[side])
                const disabled = full || loadingSlots || slotsError || bothSidesFull
                const teamColor = side === 'A' ? colorA : colorB
                const selected = pickTeam === side
                return (
                  <Button
                    key={side}
                    type="button"
                    variant="outline"
                    disabled={disabled}
                    className={cn(
                      'h-11 border-2 font-semibold transition-colors',
                      selected &&
                        'shadow-md ring-2 ring-primary ring-offset-2 ring-offset-background',
                      !selected &&
                        !disabled &&
                        'bg-muted/60 text-foreground hover:bg-muted hover:text-foreground',
                      disabled && 'opacity-50'
                    )}
                    style={
                      disabled
                        ? undefined
                        : selected
                          ? {
                              backgroundColor: teamColor,
                              borderColor: teamColor,
                              color: teamPickContrastForeground(teamColor),
                            }
                          : {
                              borderColor: teamPickAccentBorderForOutline(teamColor),
                            }
                    }
                    onClick={() => setPickTeam(side)}
                  >
                    {label}
                  </Button>
                )
              })}
            </div>
            {sideFull && slotsReady ? (
              <p className="text-xs text-destructive">
                Este equipo ya está completo. Elige el otro lado.
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label>Tu rol en este encuentro</Label>
            <div className="grid grid-cols-2 gap-2">
              {ROLES.map((r) => {
                const isGk = r.value === 'gk'
                const disabled =
                  loadingSlots ||
                  slotsError ||
                  (isGk
                    ? gkTakenOnSide
                    : fieldFullOnSide)
                return (
                  <Button
                    key={r.value}
                    type="button"
                    variant={role === r.value ? 'default' : 'outline'}
                    className={cn('h-11 text-sm', disabled && 'opacity-50')}
                    disabled={disabled}
                    onClick={() => setRole(r.value)}
                  >
                    {r.label}
                  </Button>
                )
              })}
            </div>
            {gkTakenOnSide && slotsReady ? (
              <p className="text-xs text-muted-foreground leading-snug">
                Ya hay arquero en el equipo {pickTeam}. Elige otra posición u otro equipo si queda cupo de arquero.
              </p>
            ) : null}
            {fieldFullOnSide && !gkTakenOnSide && slotsReady ? (
              <p className="text-xs text-muted-foreground leading-snug">
                Los cupos de campo del equipo {pickTeam} ya están llenos. Puedes entrar como arquero si aún hay cupo.
              </p>
            ) : null}
          </div>

          <JoinPayOrganizerNotice opportunity={opportunity} />
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            disabled={submitting}
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button type="button" disabled={!canSubmit} onClick={() => void handleSubmit()}>
            {submitting ? 'Uniéndome…' : 'Unirme'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
