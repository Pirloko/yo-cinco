'use client'

import { cn } from '@/lib/utils'
import {
  TEAM_PICK_JERSEY_PRESETS,
  coerceTeamPickJerseyPresetHex,
} from '@/lib/team-pick-ui'

function strokeForShieldFill(hex: string): string {
  const h = hex.toLowerCase()
  if (h === '#ffffff') return 'rgba(0, 0, 0, 0.45)'
  if (h === '#000000') return 'rgba(255, 255, 255, 0.32)'
  return 'rgba(255, 255, 255, 0.22)'
}

/** Escudo tipo club; el relleno es el color del equipo. */
export function TeamPickShieldShape({
  fill,
  className,
}: {
  fill: string
  className?: string
}) {
  const stroke = strokeForShieldFill(fill)
  return (
    <svg
      viewBox="0 0 40 48"
      className={cn('h-11 w-9 shrink-0 drop-shadow-md', className)}
      aria-hidden
    >
      <path
        fill={fill}
        stroke={stroke}
        strokeWidth="1.25"
        strokeLinejoin="round"
        d="M20 3.5 L34.5 10.5 V26.2 C34.5 34.8 28.2 41.8 20 45.2 C11.8 41.8 5.5 34.8 5.5 26.2 V10.5 L20 3.5 Z"
      />
    </svg>
  )
}

type TeamPickJerseyColorPickerProps = {
  label: string
  value: string
  fallbackHex: string
  onChange: (hex: string) => void
}

export function TeamPickJerseyColorPicker({
  label,
  value,
  fallbackHex,
  onChange,
}: TeamPickJerseyColorPickerProps) {
  const effective = coerceTeamPickJerseyPresetHex(value) ?? fallbackHex
  const colorName =
    TEAM_PICK_JERSEY_PRESETS.find(
      (p) => p.hex.toLowerCase() === effective.toLowerCase()
    )?.label ?? 'seleccionado'

  return (
    <div className="rounded-xl border border-border bg-secondary/25 px-2 py-2.5 sm:px-2.5">
      <div className="flex flex-col items-center gap-2.5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <div
          className="flex items-end justify-center gap-2 sm:gap-3"
          role="group"
          aria-label={`Color de equipo (${label}): actualmente ${colorName}`}
        >
          {TEAM_PICK_JERSEY_PRESETS.map(({ label: presetLabel, hex }) => {
            const selected = effective.toLowerCase() === hex.toLowerCase()
            return (
              <button
                key={hex}
                type="button"
                onClick={() => onChange(hex)}
                title={presetLabel}
                className={cn(
                  'relative flex flex-col items-center justify-end rounded-lg px-0.5 pb-0.5 transition-[transform,box-shadow] touch-manipulation',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                  selected
                    ? 'z-[1] scale-[1.06] ring-2 ring-primary'
                    : 'ring-1 ring-transparent hover:ring-white/35',
                  'active:scale-95',
                  !selected && 'hover:scale-[1.05]'
                )}
                aria-pressed={selected}
                aria-label={`${presetLabel}, escudo ${label}`}
              >
                <TeamPickShieldShape fill={hex} />
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
