'use client'

import { PushServiceWorkerRegister } from '@/components/push-service-worker-register'
import { ThemeProvider } from '@/components/theme-provider'
import { Toaster } from '@/components/ui/sonner'
import { AppProvider } from '@/lib/app-context'
import { QueryProvider } from '@/lib/query-client-provider'

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem
      storageKey="sportmatch-theme"
      disableTransitionOnChange
    >
      <QueryProvider>
        <AppProvider>{children}</AppProvider>
      </QueryProvider>
      <PushServiceWorkerRegister />
      <Toaster richColors position="top-center" />
    </ThemeProvider>
  )
}
