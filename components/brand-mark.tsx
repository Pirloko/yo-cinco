import Image from 'next/image'

import { cn } from '@/lib/utils'

export type BrandMarkSize = 'sm' | 'md'

type BrandMarkProps = {
  size?: BrandMarkSize
  showText?: boolean
  /** Texto junto al logo; por defecto el wordmark de producto en mayúsculas */
  label?: string
  textClassName?: string
  className?: string
  /** Miniatura de `/logohome.png` alineada con el wordmark del hero */
  showLogo?: boolean
  /** Misma cadencia que el texto curvo “SportMatch” (tracking + sans bold) */
  wordmarkTypography?: boolean
}

export function BrandMark({
  size = 'md',
  showText = true,
  label = 'SPORTMATCH',
  textClassName,
  className,
  showLogo = false,
  wordmarkTypography = false,
}: BrandMarkProps) {
  if (!showText) return null

  const logoClass =
    size === 'sm' ? 'h-12 w-12' : 'h-20 w-20 md:h-28 md:w-28'

  return (
    <div className={cn('flex items-center gap-3 md:gap-3.5', className)}>
      {showLogo ? (
        <Image
          src="/logohome.png"
          alt=""
          width={512}
          height={512}
          className={cn('shrink-0 object-contain', logoClass)}
          sizes="(max-width: 768px) 80px, 112px"
          priority={false}
          aria-hidden
        />
      ) : null}
      <span
        className={cn(
          'text-foreground',
          wordmarkTypography
            ? 'font-brand-round text-xl font-extrabold tracking-[0.06em] md:text-2xl'
            : cn(
                'font-sans font-bold tracking-tight',
                size === 'sm' ? 'text-lg' : 'text-xl'
              ),
          textClassName
        )}
      >
        {label}
      </span>
    </div>
  )
}
