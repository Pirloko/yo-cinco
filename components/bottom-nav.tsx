'use client'

import { usePathname, useRouter } from 'next/navigation'
import { toast } from 'sonner'

import { useAppAuth, useAppUI } from '@/lib/app-context'
import { persistPlayerLastNav } from '@/lib/player-nav-storage'
import { Home, Search, LayoutList, PlusCircle, Users, User } from 'lucide-react'

type NavItem = 'home' | 'explore' | 'matches' | 'create' | 'teams' | 'profile'

export function BottomNav() {
  const pathname = usePathname()
  const router = useRouter()
  const { currentScreen, setCurrentScreen } = useAppUI()
  const { currentUser } = useAppAuth()

  if (currentUser?.accountType === 'venue' || currentUser?.accountType === 'admin')
    return null

  const playerBanned =
    currentUser?.accountType === 'player' && Boolean(currentUser.modBannedAt)

  const navItems: { id: NavItem; icon: React.ReactNode; label: string }[] = [
    { id: 'home', icon: <Home className="w-5 h-5 sm:w-6 sm:h-6" />, label: 'Inicio' },
    { id: 'explore', icon: <Search className="w-5 h-5 sm:w-6 sm:h-6" />, label: 'Explorar' },
    {
      id: 'matches',
      icon: <LayoutList className="w-5 h-5 sm:w-6 sm:h-6" />,
      label: 'Partidos',
    },
    {
      id: 'create',
      icon: <PlusCircle className="w-6 h-6 sm:w-7 sm:h-7" />,
      label: 'Crear',
    },
    { id: 'teams', icon: <Users className="w-5 h-5 sm:w-6 sm:h-6" />, label: 'Equipos' },
    { id: 'profile', icon: <User className="w-5 h-5 sm:w-6 sm:h-6" />, label: 'Perfil' },
  ]

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-background border-t border-border safe-area-inset-bottom z-50">
      <div className="flex items-stretch justify-around h-16 max-w-lg mx-auto px-0.5">
        {navItems.map((item) => {
          const isActive = currentScreen === item.id
          const isCreate = item.id === 'create'

          const lockedByBan = playerBanned && item.id !== 'profile'

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                if (lockedByBan) {
                  toast.error(
                    'Tu cuenta está restringida: solo puedes ver tu perfil. Si crees que es un error, contacta soporte.'
                  )
                  return
                }
                persistPlayerLastNav(item.id)
                if (pathname !== '/') {
                  router.push('/')
                }
                setCurrentScreen(item.id)
              }}
              className={`flex flex-col items-center justify-center flex-1 min-w-0 py-1 transition-colors ${
                lockedByBan
                  ? 'opacity-40 text-muted-foreground'
                  : isCreate
                    ? 'text-primary'
                    : isActive
                      ? 'text-primary'
                      : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <div className={isCreate ? 'relative' : ''}>
                {isCreate && (
                  <div className="absolute inset-0 bg-primary/20 rounded-full scale-150 animate-pulse" />
                )}
                {item.icon}
              </div>
              <span
                className={`font-brand-heading text-[10px] sm:text-xs mt-0.5 leading-tight text-center max-w-[64px] truncate ${
                  isCreate ? 'font-semibold' : ''
                }`}
              >
                {item.label}
              </span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
