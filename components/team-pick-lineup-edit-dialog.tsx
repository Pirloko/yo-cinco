'use client'

import { useEffect, useMemo, useState } from 'react'
import type { EncounterLineupRole, MatchType, PickTeamSide } from '@/lib/types'
import type { OpportunityParticipantRow } from '@/lib/supabase/message-queries'
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
import {
  TEAM_PICK_MAX_FIELD_PER_SIDE,
  TEAM_PICK_MAX_GK_PER_SIDE,
  teamPickColorsForUi,
  teamPickSideIsFull,
  teamPickSlotsFromParticipantsExcluding,
} from '@/lib/team-pick-ui'
import { cn } from '@/lib/utils'

const ROLES: { value: EncounterLineupRole; label: string }[] = [
  { value: 'gk', label: 'Arquero' },
  { value: 'defensa', label: 'Defensa' },
  { value: 'mediocampista', label: 'Mediocampista' },
  { value: 'delantero', label: 'Delantero' },
]

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  initialTeam: PickTeamSide
  initialRole: EncounterLineupRole
  /** Lista actual para calcular cupos (se excluye a `excludeUserId`). */
  participantsForSlots: OpportunityParticipantRow[]
  excludeUserId: string
  matchType: MatchType
  teamPickColorA?: string | null
  teamPickColorB?: string | null
  onSave: (payload: {
    pickTeam: PickTeamSide
    encounterLineupRole: EncounterLineupRole
  }) => Promise<{ ok: boolean }>
}

export function TeamPickLineupEditDialog({
  open,
  onOpenChange,
  title,
  initialTeam,
  initialRole,
  participantsForSlots,
  excludeUserId,
  matchType,
  teamPickColorA,
  teamPickColorB,
  onSave,
}: Props) {
  const [pickTeam, setPickTeam] = useState<PickTeamSide>(initialTeam)
  const [role, setRole] = useState<EncounterLineupRole>(initialRole)
  const [saving, setSaving] = useState(false)

  const { colorA, colorB } = teamPickColorsForUi({
    type: matchType,
    teamPickColorA,
    teamPickColorB,
  })

  const slots = useMemo(
    () =>
      teamPickSlotsFromParticipantsExcluding(
        participantsForSlots,
        excludeUserId
      ),
    [participantsForSlots, excludeUserId]
  )

  useEffect(() => {
    if (open) {
      setPickTeam(initialTeam)
      setRole(initialRole)
      setSaving(false)
    }
  }, [open, initialTeam, initialRole])

  useEffect(() => {
    if (!open) return
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
  }, [open, pickTeam, role, slots])

  const gkTakenOnSide = slots[pickTeam].gk >= TEAM_PICK_MAX_GK_PER_SIDE
  const fieldFullOnSide = slots[pickTeam].field >= TEAM_PICK_MAX_FIELD_PER_SIDE
  const sideFull = teamPickSideIsFull(slots[pickTeam])
  const bothSidesFull =
    teamPickSideIsFull(slots.A) && teamPickSideIsFull(slots.B)

  const roleChoiceValid =
    role === 'gk' ? !gkTakenOnSide : !fieldFullOnSide

  const canSave =
    !saving &&
    !sideFull &&
    roleChoiceValid &&
    !bothSidesFull

  const handleSave = async () => {
    if (!canSave) return
    setSaving(true)
    try {
      const r = await onSave({ pickTeam, encounterLineupRole: role })
      if (r.ok) onOpenChange(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Máximo 6 por equipo (1 arquero y 5 de campo). Los cupos abajo ignoran tu
            posición actual hasta que guardes.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="rounded-lg border border-border bg-secondary/30 px-3 py-2.5 space-y-2 text-xs">
            <p className="font-medium text-[11px] uppercase tracking-wide text-muted-foreground">
              Cupos por equipo
            </p>
            {bothSidesFull ? (
              <p className="text-muted-foreground">Ambos equipos completos.</p>
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
                const disabled = full || bothSidesFull
                return (
                  <Button
                    key={side}
                    type="button"
                    variant={pickTeam === side ? 'default' : 'outline'}
                    disabled={disabled}
                    className={cn(
                      'h-11',
                      pickTeam !== side && !disabled && 'border-2 bg-background',
                      disabled && 'opacity-50'
                    )}
                    style={
                      disabled
                        ? undefined
                        : side === 'A'
                          ? pickTeam === 'A'
                            ? {
                                backgroundColor: colorA,
                                borderColor: colorA,
                                color: '#fafafa',
                              }
                            : { borderColor: colorA }
                          : pickTeam === 'B'
                            ? {
                                backgroundColor: colorB,
                                borderColor: colorB,
                                color: '#fafafa',
                              }
                            : { borderColor: colorB }
                    }
                    onClick={() => setPickTeam(side)}
                  >
                    {label}
                  </Button>
                )
              })}
            </div>
            {sideFull ? (
              <p className="text-xs text-destructive">
                Este equipo está completo. Elegí el otro bando.
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label>Rol en el encuentro</Label>
            <div className="grid grid-cols-2 gap-2">
              {ROLES.map((r) => {
                const isGk = r.value === 'gk'
                const disabled = isGk ? gkTakenOnSide : fieldFullOnSide
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
            {gkTakenOnSide ? (
              <p className="text-xs text-muted-foreground leading-snug">
                Ya hay arquero en el equipo {pickTeam}. Elegí otra posición u otro bando
                con cupo de arquero.
              </p>
            ) : null}
            {fieldFullOnSide && !gkTakenOnSide ? (
              <p className="text-xs text-muted-foreground leading-snug">
                Cupo de campo lleno en el equipo {pickTeam}. Podés ir de arquero si hay
                cupo.
              </p>
            ) : null}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            disabled={saving}
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button type="button" disabled={!canSave} onClick={() => void handleSave()}>
            {saving ? 'Guardando…' : 'Guardar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
