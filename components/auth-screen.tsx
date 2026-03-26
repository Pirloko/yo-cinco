'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useApp } from '@/lib/app-context'
import { Gender } from '@/lib/types'
import { ArrowLeft, Mail, Lock, User } from 'lucide-react'
import { JOIN_REGISTER_STORAGE_KEY } from '@/lib/team-invite-url'
import { tryNavigateCreateAfterPlayerReady } from '@/lib/create-prefill'

export function AuthScreen() {
  const { setCurrentScreen, login, setOnboardingSource } = useApp()
  const [isLogin, setIsLogin] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [gender, setGender] = useState<Gender>('male')
  const [isLoading, setIsLoading] = useState(false)

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

    const result = await login(email, password, gender, !isLogin)

    if (result.ok) {
      if (result.isVenue) {
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
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <span className="text-primary-foreground font-bold">P</span>
          </div>
          <span className="font-bold text-lg text-foreground">Pichanga</span>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md space-y-8">
          {/* Title */}
          <div className="text-center space-y-2">
            <h1 className="text-3xl font-bold text-foreground">
              {isLogin ? 'Bienvenido de vuelta' : 'Crear cuenta'}
            </h1>
            <p className="text-muted-foreground">
              {isLogin 
                ? 'Ingresa tus datos para continuar' 
                : 'Registrate para encontrar tu partido'}
            </p>
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

            {/* Gender Selection */}
            {!isLogin && (
              <div className="space-y-3">
                <Label className="text-foreground">Genero</Label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setGender('male')}
                    className={`p-4 rounded-xl border-2 transition-all flex flex-col items-center gap-2 ${
                      gender === 'male'
                        ? 'border-primary bg-primary/10'
                        : 'border-border bg-secondary hover:border-muted-foreground'
                    }`}
                  >
                    <User className={`w-6 h-6 ${gender === 'male' ? 'text-primary' : 'text-muted-foreground'}`} />
                    <span className={`font-medium ${gender === 'male' ? 'text-primary' : 'text-foreground'}`}>
                      Masculino
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setGender('female')}
                    className={`p-4 rounded-xl border-2 transition-all flex flex-col items-center gap-2 ${
                      gender === 'female'
                        ? 'border-primary bg-primary/10'
                        : 'border-border bg-secondary hover:border-muted-foreground'
                    }`}
                  >
                    <User className={`w-6 h-6 ${gender === 'female' ? 'text-primary' : 'text-muted-foreground'}`} />
                    <span className={`font-medium ${gender === 'female' ? 'text-primary' : 'text-foreground'}`}>
                      Femenino
                    </span>
                  </button>
                </div>
                <p className="text-xs text-muted-foreground text-center">
                  Solo veras partidos y jugadores de tu mismo genero
                </p>
              </div>
            )}

            {/* Submit Button */}
            <Button 
              type="submit" 
              className="w-full h-12 text-lg bg-primary text-primary-foreground hover:bg-primary/90"
              disabled={isLoading}
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
