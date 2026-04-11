'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { useAppAuth, useAppUI } from '@/lib/app-context'
import { ArrowLeft, Mail, Lock } from 'lucide-react'
import { ThemeMenuButton } from '@/components/theme-controls'
import { BrandMark } from '@/components/brand-mark'
import { JOIN_REGISTER_STORAGE_KEY } from '@/lib/team-invite-url'
import { tryNavigateCreateAfterPlayerReady } from '@/lib/create-prefill'

function GoogleGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  )
}

export function AuthScreen() {
  const { setCurrentScreen, setOnboardingSource } = useAppUI()
  const { login, loginWithGoogle } = useAppAuth()
  const [isLogin, setIsLogin] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)

  useEffect(() => {
    try {
      if (sessionStorage.getItem(JOIN_REGISTER_STORAGE_KEY) === '1') {
        sessionStorage.removeItem(JOIN_REGISTER_STORAGE_KEY)
        setIsLogin(false)
      }
    } catch {
      // ignore
    }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    const result = await login(email, password, !isLogin)

    if (result.ok) {
      if (result.isAdmin) {
        setCurrentScreen('adminDashboard')
      } else if (result.isVenue) {
        setCurrentScreen(
          result.needsVenueOnboarding ? 'venueOnboarding' : 'venueDashboard'
        )
      } else if (result.needsOnboarding) {
        setOnboardingSource('registration')
        setCurrentScreen('onboarding')
      } else if (tryNavigateCreateAfterPlayerReady()) {
        setCurrentScreen('create')
      } else {
        setCurrentScreen('home')
      }
    } else if (result.error) {
      toast.error(result.error)
    }

    setIsLoading(false)
  }

  const handleGoogle = async () => {
    setGoogleLoading(true)
    const result = await loginWithGoogle()
    setGoogleLoading(false)
    if (!result.ok && result.error) {
      toast.error(result.error)
    }
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="flex items-center gap-4 p-4">
        <Button 
          variant="ghost" 
          size="icon"
          onClick={() => setCurrentScreen('landing')}
          className="text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <BrandMark size="sm" textClassName="text-lg font-bold" />
        <div className="ml-auto flex items-center">
          <ThemeMenuButton />
        </div>
      </header>

      {/* Main Content */}
      <main className="flex flex-1 items-center justify-center overflow-y-auto p-4">
        <div className="w-full max-w-md space-y-8">
          <div className="flex justify-center px-2">
            <div className="relative animate-float-logo">
              <div
                className="pointer-events-none absolute left-1/2 top-1/2 -z-0 h-[140%] w-[120%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/20 blur-3xl dark:bg-primary/35"
                aria-hidden
              />
              <Image
                src="/logohome.webp"
                alt="SPORTMATCH"
                width={1200}
                height={800}
                className="relative z-10 mx-auto h-40 w-auto max-w-[min(100%,280px)] object-contain drop-shadow-[0_0_28px_oklch(0.72_0.19_142_/_0.3)] md:h-44"
                sizes="(max-width: 768px) 70vw, 280px"
                priority
              />
            </div>
          </div>

          {/* Title */}
          <div className="text-center space-y-2">
            {isLogin ? (
              <p className="text-pretty text-lg font-medium leading-relaxed text-foreground md:text-xl">
                Ingresa tus datos para iniciar sesión o inicia sesión con Google.
              </p>
            ) : (
              <>
                <h1 className="text-3xl font-bold text-foreground">Crear cuenta</h1>
                <p className="text-muted-foreground">
                  Regístrate con email o Google. Luego completarás WhatsApp y género en el
                  siguiente paso.
                </p>
              </>
            )}
          </div>

          <div className="space-y-4">
            <Button
              type="button"
              variant="outline"
              className="w-full h-12 text-base border-border bg-secondary/50 hover:bg-secondary text-foreground"
              onClick={handleGoogle}
              disabled={isLoading || googleLoading}
            >
              <GoogleGlyph className="mr-2 h-5 w-5 shrink-0" />
              {googleLoading
                ? 'Abriendo Google...'
                : isLogin
                  ? 'Continuar con Google'
                  : 'Crear cuenta con Google'}
            </Button>

            <div className="relative">
              <Separator className="bg-border" />
              <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-background px-2 text-xs text-muted-foreground">
                o con email
              </span>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Email */}
            <div className="space-y-2">
              <Label htmlFor="email" className="text-foreground">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="tu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10 h-12 bg-secondary border-border text-foreground placeholder:text-muted-foreground"
                  required
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-2">
              <Label htmlFor="password" className="text-foreground">Contrasena</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  placeholder="Tu contrasena"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10 h-12 bg-secondary border-border text-foreground placeholder:text-muted-foreground"
                  required
                  minLength={6}
                  autoComplete={isLogin ? 'current-password' : 'new-password'}
                />
              </div>
              {!isLogin && (
                <p className="text-xs text-muted-foreground">
                  Mínimo 6 caracteres (o el mínimo que definas en Supabase → Authentication → Providers).
                </p>
              )}
            </div>

            {/* Submit Button */}
            <Button 
              type="submit" 
              className="w-full h-12 text-lg bg-primary text-primary-foreground hover:bg-primary/90"
              disabled={isLoading || googleLoading}
            >
              {isLoading ? 'Cargando...' : isLogin ? 'Iniciar sesion' : 'Crear cuenta'}
            </Button>
          </form>

          {/* Toggle */}
          <div className="text-center">
            <button
              type="button"
              onClick={() => setIsLogin(!isLogin)}
              className="text-muted-foreground hover:text-primary transition-colors"
            >
              {isLogin 
                ? 'No tienes cuenta? Registrate' 
                : 'Ya tienes cuenta? Inicia sesion'}
            </button>
          </div>
        </div>
      </main>
    </div>
  )
}
