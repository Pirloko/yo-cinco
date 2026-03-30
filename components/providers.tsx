'use client'

import { ThemeProvider } from '@/components/theme-provider'
import { Toaster } from '@/components/ui/sonner'
import { AppProvider } from '@/lib/app-context'

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem
      storageKey="sportmatch-theme"
      disableTransitionOnChange
    >
      <AppProvider>{children}</AppProvider>
      <Toaster richColors position="top-center" />
    </ThemeProvider>
  )
}
