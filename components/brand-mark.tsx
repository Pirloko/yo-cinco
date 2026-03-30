import { cn } from '@/lib/utils'

export type BrandMarkSize = 'sm' | 'md'

type BrandMarkProps = {
  size?: BrandMarkSize
  showText?: boolean
  textClassName?: string
  className?: string
}

export function BrandMark({
  size = 'md',
  showText = true,
  textClassName,
  className,
}: BrandMarkProps) {
  if (!showText) return null

  return (
    <div className={cn('flex items-center', className)}>
      <span
        className={cn(
          'font-bold tracking-tight text-foreground',
          size === 'sm' ? 'text-lg' : 'text-xl',
          textClassName
        )}
      >
        SPORTMATCH
      </span>
    </div>
  )
}
