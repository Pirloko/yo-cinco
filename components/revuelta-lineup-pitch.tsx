'use client'

import { useMemo } from 'react'
import Image from 'next/image'
import type { RevueltaLineup } from '@/lib/revuelta-lineup'
import type { OpportunityParticipantRow } from '@/lib/supabase/message-queries'
import { buildRevueltaPitchLayout } from '@/lib/revuelta-pitch-lineup'
import { teamPickJerseyPresetLabel } from '@/lib/team-pick-ui'
import { MatchPitchMarkings } from '@/components/match-pitch-markings'
import { TeamPickShieldShape } from '@/components/team-pick-jersey-color-picker'
import { cn } from '@/lib/utils'

type Props = {
  lineup: RevueltaLineup
  participants: OpportunityParticipantRow[]
  currentUserId?: string
  avatarDisplayUrl: (url: string, userId?: string) => string
}

function PlayerDisc({
  label,
  name,
  photo,
  userId,
  jerseyColor,
  isMe,
  avatarDisplayUrl,
}: {
  label: string
  name: string
  photo: string
  userId: string
  jerseyColor: string
  isMe: boolean
  avatarDisplayUrl: (url: string, userId?: string) => string
}) {
  return (
    <div className="flex w-[4.75rem] flex-col items-center sm:w-[5rem]">
      <div className="relative mb-1 flex shrink-0 items-center justify-center">
        <span
          className="relative flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-b from-white to-zinc-100 shadow-md sm:h-11 sm:w-11"
          style={{
            boxShadow: `0 0 0 3px ${jerseyColor}, 0 2px 8px rgba(0,0,0,0.35)`,
          }}
        >
          <Image
            src={avatarDisplayUrl(photo, userId)}
            alt=""
            width={40}
            height={40}
            className="h-9 w-9 rounded-full object-cover sm:h-10 sm:w-10"
          />
        </span>
        <span
          className="pointer-events-none absolute -bottom-1 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded px-1 py-px text-[7px] font-bold uppercase leading-none tracking-wide text-white shadow-sm"
          style={{ backgroundColor: jerseyColor }}
        >
          {label}
        </span>
      </div>
      <p
        className={cn(
          'w-full truncate rounded-md px-1 py-0.5 text-center text-[9px] font-medium leading-tight',
          isMe ? 'bg-primary/25 text-primary' : 'bg-black/50 text-white'
        )}
        title={name}
      >
        {name}
      </p>
    </div>
  )
}

function EmptySlot({ label, jerseyColor }: { label: string; jerseyColor: string }) {
  return (
    <div className="flex w-[4.75rem] flex-col items-center sm:w-[5rem]">
      <div className="relative mb-1 flex h-10 w-10 items-center justify-center rounded-full border-2 border-dashed border-white/25 bg-emerald-950/35 sm:h-11 sm:w-11">
        <span className="text-[9px] font-semibold text-white/35">—</span>
        <span
          className="pointer-events-none absolute -bottom-1 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded px-1 py-px text-[7px] font-bold uppercase leading-none text-white/70"
          style={{ backgroundColor: `${jerseyColor}99` }}
        >
          {label}
        </span>
      </div>
      <p className="w-full truncate text-center text-[9px] text-white/45">Libre</p>
    </div>
  )
}

function TeamColorHeader({
  label,
  colorHex,
}: {
  label: string
  colorHex: string
}) {
  const colorName = teamPickJerseyPresetLabel(colorHex)
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl border border-border/80 bg-secondary/30 px-3 py-2">
      <TeamPickShieldShape fill={colorHex} className="h-9 w-7 shrink-0 drop-shadow-sm" />
      <div className="min-w-0">
        <p className="font-brand-heading text-sm text-foreground">{label}</p>
        <p className="text-[11px] text-muted-foreground truncate">
          Camiseta{' '}
          <span className="font-medium text-foreground">{colorName}</span>
        </p>
      </div>
      <span
        className="ml-auto h-5 w-5 shrink-0 rounded-full border border-white/20 shadow-inner"
        style={{ backgroundColor: colorHex }}
        aria-hidden
      />
    </div>
  )
}

export function RevueltaLineupPitch({ lineup, participants, currentUserId, avatarDisplayUrl }: Props) {
  const layout = useMemo(
    () => buildRevueltaPitchLayout(lineup, participants, currentUserId),
    [lineup, participants, currentUserId]
  )

  const allFieldSlots: Array<{
    cell: (typeof layout.sideA.fieldSlots)[0]
    side: 'A' | 'B'
    colorHex: string
  }> = []

  for (const cell of layout.sideA.fieldSlots) {
    allFieldSlots.push({ cell, side: 'A', colorHex: layout.sideA.colorHex })
  }
  for (const cell of layout.sideB.fieldSlots) {
    allFieldSlots.push({ cell, side: 'B', colorHex: layout.sideB.colorHex })
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-4">
      <div>
        <h3 className="font-brand-heading text-base text-foreground">Plantilla en cancha</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Equipos sorteados · formación 1-2-2-1
        </p>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <TeamColorHeader label="Equipo A" colorHex={layout.sideA.colorHex} />
        <TeamColorHeader label="Equipo B" colorHex={layout.sideB.colorHex} />
      </div>

      <div
        className={cn(
          'relative mx-auto w-full max-w-[22rem] overflow-hidden rounded-2xl sm:max-w-md',
          'border border-emerald-900/50 shadow-xl ring-1 ring-inset ring-white/10',
          'aspect-[5/8] min-h-[26rem] sm:min-h-[28rem]'
        )}
      >
        <div
          className="absolute inset-0 bg-gradient-to-b from-emerald-600 via-emerald-700 to-emerald-800"
          aria-hidden
        />
        <div
          className="absolute inset-0 opacity-30 mix-blend-overlay"
          style={{
            backgroundImage:
              'repeating-linear-gradient(0deg, transparent, transparent 18px, rgba(0,0,0,0.12) 18px, rgba(0,0,0,0.12) 36px)',
          }}
          aria-hidden
        />
        <div
          className="absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-black/15"
          aria-hidden
        />

        <MatchPitchMarkings />

        <div className="absolute inset-[6%_5%] z-[2]">
          {allFieldSlots.map(({ cell, side }) => {
            const sideLayout = side === 'A' ? layout.sideA : layout.sideB
            const occ = sideLayout.occupantsBySlot.get(cell.slotId)
            const label = cell.shortLabel
            return (
              <div
                key={`${side}-${cell.slotId}`}
                className="absolute -translate-x-1/2 -translate-y-1/2"
                style={{ left: `${cell.x}%`, top: `${cell.y}%` }}
              >
                {occ ? (
                  <PlayerDisc
                    label={label}
                    name={occ.name}
                    photo={occ.photo}
                    userId={occ.userId}
                    jerseyColor={sideLayout.colorHex}
                    isMe={occ.isMe}
                    avatarDisplayUrl={avatarDisplayUrl}
                  />
                ) : (
                  <EmptySlot label={label} jerseyColor={sideLayout.colorHex} />
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
