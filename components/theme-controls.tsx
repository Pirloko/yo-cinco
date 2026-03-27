'use client'

import * as React from 'react'
import { useTheme } from 'next-themes'
import { Check, Monitor, Moon, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'

export function ThemeSegmentedControl({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => setMounted(true), [])
  if (!mounted) {
    return (
      <div
        className={cn(
          'h-10 w-full rounded-md border border-border bg-muted/50',
          className,
        )}
        aria-hidden
      />
    )
  }
  const value = theme ?? 'system'
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      size="sm"
      className={cn('w-full', className)}
      value={value}
      onValueChange={(v) => v && setTheme(v)}
    >
      <ToggleGroupItem value="light" className="flex-1 px-1 text-xs sm:text-sm">
        Claro
      </ToggleGroupItem>
      <ToggleGroupItem value="dark" className="flex-1 px-1 text-xs sm:text-sm">
        Oscuro
      </ToggleGroupItem>
      <ToggleGroupItem value="system" className="flex-1 px-1 text-xs sm:text-sm">
        Sistema
      </ToggleGroupItem>
    </ToggleGroup>
  )
}

export function ThemeMenuButton({ className }: { className?: string }) {
  const { theme, setTheme, resolvedTheme } = useTheme()
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => setMounted(true), [])

  if (!mounted) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={className}
        disabled
        aria-label="Tema de la aplicación"
      >
        <Sun className="h-5 w-5 opacity-40" />
      </Button>
    )
  }

  const triggerIcon =
    theme === 'system' ? (
      <Monitor className="h-5 w-5 text-muted-foreground" />
    ) : resolvedTheme === 'dark' ? (
      <Moon className="h-5 w-5 text-muted-foreground" />
    ) : (
      <Sun className="h-5 w-5 text-muted-foreground" />
    )

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={className}
          aria-label="Tema de la aplicación: claro, oscuro o según el sistema"
        >
          {triggerIcon}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[12rem]">
        <DropdownMenuItem
          className="justify-between"
          onClick={() => setTheme('light')}
        >
          <span className="flex items-center gap-2">
            <Sun className="h-4 w-4" />
            Claro
          </span>
          {theme === 'light' ? <Check className="h-4 w-4" /> : null}
        </DropdownMenuItem>
        <DropdownMenuItem
          className="justify-between"
          onClick={() => setTheme('dark')}
        >
          <span className="flex items-center gap-2">
            <Moon className="h-4 w-4" />
            Oscuro
          </span>
          {theme === 'dark' ? <Check className="h-4 w-4" /> : null}
        </DropdownMenuItem>
        <DropdownMenuItem
          className="justify-between"
          onClick={() => setTheme('system')}
        >
          <span className="flex items-center gap-2">
            <Monitor className="h-4 w-4" />
            Según el sistema
          </span>
          {theme === 'system' ? <Check className="h-4 w-4" /> : null}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
