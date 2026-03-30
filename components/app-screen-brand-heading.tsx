import type { ReactNode } from 'react'
import Image from 'next/image'

import { cn } from '@/lib/utils'

type AppScreenBrandHeadingProps = {
  /** Texto pequeño encima del título (ej. «Perfil») */
  eyebrow?: string
  title: string
  subtitle?: string
  /** Ej.: botón atrás a la izquierda del logo */
  before?: ReactNode
  titleClassName?: string
  className?: string
}

export function AppScreenBrandHeading({
  eyebrow,
  title,
  subtitle,
  before,
  titleClassName,
  className,
}: AppScreenBrandHeadingProps) {
  return (
    <div className={cn('flex w-full items-center gap-2 sm:gap-3', className)}>
      {before}
      <div
        className={cn(
          'flex min-w-0 flex-1 gap-3',
          eyebrow ? 'items-start' : 'items-center'
        )}
      >
        <div className="relative shrink-0 animate-float-logo-sm">
          <div
            className="pointer-events-none absolute inset-0 -z-10 scale-125 rounded-2xl bg-primary/20 blur-xl dark:bg-primary/30"
            aria-hidden
          />
          <Image
            src="/sportmatch-logo.png"
            alt="SPORTMATCH"
            width={160}
            height={160}
            className="h-11 w-11 object-contain drop-shadow-[0_0_12px_oklch(0.72_0.19_142_/_0.25)] md:h-12 md:w-12"
            sizes="48px"
            loading="eager"
          />
        </div>
        <div className="min-w-0">
          {eyebrow ? (
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {eyebrow}
            </p>
          ) : null}
          <h1
            className={cn(
              'truncate font-bold text-foreground',
              eyebrow && 'mt-0.5',
              titleClassName ?? 'text-2xl'
            )}
          >
            {title}
          </h1>
          {subtitle ? (
            <p className="mt-0.5 truncate text-sm text-muted-foreground">
              {subtitle}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  )
}
