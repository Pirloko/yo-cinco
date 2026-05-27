'use client'

import Image from 'next/image'
import { Plus } from 'lucide-react'
import type { RivalLineupSlotCell, RivalMatchLineupLayout } from '@/lib/match-lineup-slots'
import type { RivalLineupSlotId } from '@/lib/rival-lineup-slot'
import { rivalSlotShortLabel } from '@/lib/rival-lineup-slot'
import { cn } from '@/lib/utils'

type Props = {
  layout: RivalMatchLineupLayout
  homeTeamName: string
  awayTeamName: string
  avatarUrl: (url: string, userId?: string) => string
  canPickSlot: boolean
  readOnly?: boolean
  myPickTeam: 'A' | 'B' | null
  isParticipant: boolean
  onSlotPress: (slotId: RivalLineupSlotId, pickTeam: 'A' | 'B') => void
  slotBusy?: string | null
}

function PitchMarkings() {
  const line = 'rgba(255,255,255,0.42)'
  const lineSoft = 'rgba(255,255,255,0.22)'
  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox="0 0 100 140"
      preserveAspectRatio="none"
      aria-hidden
    >
      <defs>
        <pattern id="grass-stripes" width="100" height="10" patternUnits="userSpaceOnUse">
          <rect width="100" height="5" fill="rgba(0,0,0,0.04)" />
          <rect y="5" width="100" height="5" fill="rgba(255,255,255,0.03)" />
        </pattern>
      </defs>
      <rect width="100" height="140" fill="url(#grass-stripes)" />

      <rect
        x="4"
        y="4"
        width="92"
        height="132"
        fill="none"
        stroke={line}
        strokeWidth="0.55"
        rx="1"
      />

      <line x1="4" y1="70" x2="96" y2="70" stroke={line} strokeWidth="0.5" />
      <circle cx="50" cy="70" r="9" fill="none" stroke={line} strokeWidth="0.45" />
      <circle cx="50" cy="70" r="0.8" fill={line} />

      <rect
        x="22"
        y="4"
        width="56"
        height="22"
        fill="none"
        stroke={lineSoft}
        strokeWidth="0.4"
      />
      <rect
        x="34"
        y="4"
        width="32"
        height="8"
        fill="none"
        stroke={lineSoft}
        strokeWidth="0.35"
      />

      <rect
        x="22"
        y="114"
        width="56"
        height="22"
        fill="none"
        stroke={lineSoft}
        strokeWidth="0.4"
      />
      <rect
        x="34"
        y="126"
        width="32"
        height="8"
        fill="none"
        stroke={lineSoft}
        strokeWidth="0.35"
      />

      <path
        d="M 38 26 A 12 12 0 0 0 62 26"
        fill="none"
        stroke={lineSoft}
        strokeWidth="0.35"
      />
      <path
        d="M 38 114 A 12 12 0 0 1 62 114"
        fill="none"
        stroke={lineSoft}
        strokeWidth="0.35"
      />
    </svg>
  )
}

type Occupant = { userId: string; name: string; photo: string; isMe: boolean }

function PlayerDisc({
  label,
  occupant,
  avatarUrl,
  tappable,
  readOnly,
  busy,
  onPress,
  size = 'field',
}: {
  label: string
  occupant?: Occupant
  avatarUrl: (url: string, userId?: string) => string
  tappable: boolean
  readOnly?: boolean
  busy: boolean
  onPress: () => void
  size?: 'field' | 'bench'
}) {
  const isField = size === 'field'
  const disc = isField ? 'h-10 w-10 sm:h-11 sm:w-11' : 'h-11 w-11'
  const img = isField ? 'h-9 w-9 sm:h-10 sm:w-10' : 'h-10 w-10'
  const interactive = tappable && !readOnly
  const statusText = occupant?.name ?? (interactive ? 'Elegir' : 'Libre')

  const inner = (
  <div
    className={cn(
      'flex flex-col items-center',
      isField ? 'w-[4.75rem] sm:w-[5rem]' : 'w-[4.5rem]'
    )}
  >
    <div className="relative mb-1 flex shrink-0 items-center justify-center">
      <span
        className={cn(
          'relative flex items-center justify-center rounded-full shadow-md transition-shadow',
          disc,
          occupant
            ? 'bg-gradient-to-b from-white to-zinc-100 ring-2 ring-white/95'
            : 'bg-emerald-950/50 ring-1 ring-white/30 backdrop-blur-[2px]',
          occupant?.isMe &&
            'ring-[2.5px] ring-primary ring-offset-2 ring-offset-emerald-900 shadow-[0_0_16px_rgba(34,197,94,0.4)]',
          interactive &&
            !occupant &&
            'group-hover:ring-primary/70 group-hover:bg-emerald-900/55'
        )}
      >
        {busy ? (
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
        ) : occupant ? (
          <Image
            src={avatarUrl(occupant.photo, occupant.userId)}
            alt=""
            width={40}
            height={40}
            className={cn('rounded-full object-cover', img)}
          />
        ) : readOnly ? (
          <span className="text-[9px] font-semibold text-white/35">—</span>
        ) : (
          <Plus
            className={cn(
              'text-white/45 transition-colors',
              isField ? 'h-3.5 w-3.5' : 'h-4 w-4',
              interactive && 'group-hover:text-primary'
            )}
            strokeWidth={2.5}
          />
        )}
      </span>

      <span
        className={cn(
          'pointer-events-none absolute -bottom-1 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded px-1 py-px text-[7px] font-bold uppercase leading-none tracking-wide shadow-sm',
          occupant
            ? 'bg-white text-emerald-950'
            : 'bg-black/50 text-white/80'
        )}
      >
        {label}
      </span>
    </div>

    <p
      className={cn(
        'w-full truncate rounded-md px-1 py-0.5 text-center text-[9px] font-medium leading-tight',
        occupant
          ? 'bg-black/50 text-white'
          : 'bg-black/30 text-white/60'
      )}
      title={statusText}
    >
      {statusText}
    </p>
  </div>
  )

  const shellClass = cn(
    'group',
    interactive && 'transition-transform active:scale-95 cursor-pointer',
    !interactive && 'cursor-default pointer-events-none'
  )

  if (interactive) {
    return (
      <button type="button" disabled={busy} onClick={onPress} className={shellClass}>
        {inner}
      </button>
    )
  }

  return <div className={shellClass}>{inner}</div>
}

function BenchRow({
  slots,
  side,
  occupantsBySlot,
  teamName,
  avatarUrl,
  canPick,
  readOnly,
  myPickTeam,
  onSlotPress,
  slotBusy,
}: {
  slots: RivalLineupSlotCell[]
  side: 'A' | 'B'
  occupantsBySlot: RivalMatchLineupLayout['sideA']['occupantsBySlot']
  teamName: string
  avatarUrl: (url: string, userId?: string) => string
  canPick: boolean
  readOnly?: boolean
  myPickTeam: 'A' | 'B' | null
  onSlotPress: (slotId: RivalLineupSlotId, pickTeam: 'A' | 'B') => void
  slotBusy?: string | null
}) {
  if (slots.length === 0) return null

  return (
    <div className="rounded-xl border border-border/80 bg-secondary/25 px-3 py-3">
      <div className="mb-3 flex items-center gap-2">
        <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-primary">
          Suplentes
        </span>
        <span className="min-w-0 truncate text-xs font-brand-heading text-foreground">
          {teamName}
        </span>
      </div>
      <div className="flex flex-wrap items-start justify-center gap-x-6 gap-y-4">
        {slots.map((slot) => {
          const occ = occupantsBySlot.get(slot.slotId)
          const mine = occ?.isMe
          const free = !occ
          const tappable = Boolean(
            !readOnly && canPick && myPickTeam === side && (free || mine)
          )
          return (
            <PlayerDisc
              key={slot.slotId}
              label="SUP"
              occupant={occ}
              avatarUrl={avatarUrl}
              tappable={tappable}
              readOnly={readOnly}
              busy={slotBusy === slot.slotId}
              onPress={() => tappable && onSlotPress(slot.slotId, side)}
              size="bench"
            />
          )
        })}
      </div>
    </div>
  )
}

export function RivalMatchPitchLineup({
  layout,
  homeTeamName,
  awayTeamName,
  avatarUrl,
  canPickSlot,
  readOnly = false,
  myPickTeam,
  isParticipant,
  onSlotPress,
  slotBusy,
}: Props) {
  const allFieldSlots: Array<{
    cell: RivalLineupSlotCell
    side: 'A' | 'B'
    occupant?: Occupant
  }> = []

  for (const cell of layout.sideA.fieldSlots) {
    allFieldSlots.push({
      cell,
      side: 'A',
      occupant: layout.sideA.occupantsBySlot.get(cell.slotId),
    })
  }
  for (const cell of layout.sideB.fieldSlots) {
    allFieldSlots.push({
      cell,
      side: 'B',
      occupant: layout.sideB.occupantsBySlot.get(cell.slotId),
    })
  }

  return (
    <div className="space-y-3">
      <BenchRow
        slots={layout.sideA.benchSlots}
        side="A"
        occupantsBySlot={layout.sideA.occupantsBySlot}
        teamName={homeTeamName}
        avatarUrl={avatarUrl}
        canPick={canPickSlot}
        readOnly={readOnly}
        myPickTeam={myPickTeam}
        onSlotPress={onSlotPress}
        slotBusy={slotBusy}
      />

      <div
        className={cn(
          'relative mx-auto w-full max-w-[22rem] overflow-hidden rounded-2xl sm:max-w-md',
          'border border-emerald-900/50 shadow-xl',
          'ring-1 ring-inset ring-white/10',
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

        <PitchMarkings />

        <div className="absolute inset-[6%_5%] z-[2]">
          {allFieldSlots.map(({ cell, side, occupant }) => {
            const mine = occupant?.isMe
            const tappable = Boolean(
              !readOnly &&
                canPickSlot &&
                myPickTeam === side &&
                (!occupant || (isParticipant && mine))
            )
            const label = rivalSlotShortLabel(cell.slotId)
            return (
              <div
                key={`${side}-${cell.slotId}`}
                className="absolute -translate-x-1/2 -translate-y-1/2"
                style={{ left: `${cell.x}%`, top: `${cell.y}%` }}
              >
                <PlayerDisc
                  label={label}
                  occupant={occupant}
                  avatarUrl={avatarUrl}
                  tappable={tappable}
                  readOnly={readOnly}
                  busy={slotBusy === cell.slotId}
                  onPress={() => onSlotPress(cell.slotId, side)}
                  size="field"
                />
              </div>
            )
          })}
        </div>
      </div>

      <BenchRow
        slots={layout.sideB.benchSlots}
        side="B"
        occupantsBySlot={layout.sideB.occupantsBySlot}
        teamName={awayTeamName}
        avatarUrl={avatarUrl}
        canPick={canPickSlot}
        readOnly={readOnly}
        myPickTeam={myPickTeam}
        onSlotPress={onSlotPress}
        slotBusy={slotBusy}
      />
    </div>
  )
}
