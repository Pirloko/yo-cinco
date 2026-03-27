'use client'

import { Button } from '@/components/ui/button'
import { useApp } from '@/lib/app-context'
import { Target, Users, Shuffle, ChevronRight, MapPin } from 'lucide-react'
import { ThemeMenuButton } from '@/components/theme-controls'

export function LandingPage() {
  const { setCurrentScreen } = useApp()

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between p-4 md:p-6">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
            <span className="text-primary-foreground font-bold text-xl">P</span>
          </div>
          <span className="font-bold text-xl text-foreground">Pichanga</span>
        </div>
        <div className="flex items-center gap-1">
          <ThemeMenuButton />
          <Button
            variant="ghost"
            className="text-muted-foreground hover:text-foreground"
            onClick={() => setCurrentScreen('auth')}
          >
            Iniciar sesion
          </Button>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 pb-16">
        <div className="max-w-4xl mx-auto text-center space-y-8">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-secondary border border-border">
            <MapPin className="w-4 h-4 text-primary" />
            <span className="text-sm text-muted-foreground">Rancagua, Chile</span>
          </div>

          {/* Main Headline */}
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold tracking-tight text-balance">
            <span className="text-foreground">Encuentra tu</span>
            <br />
            <span className="text-primary">partido hoy</span>
          </h1>

          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto text-pretty">
            La plataforma de matchmaking para futbol amateur 6 vs 6. 
            Conecta con rivales, encuentra jugadores y unete a partidos abiertos.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
            <Button 
              size="lg" 
              className="h-14 px-8 text-lg bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={() => setCurrentScreen('auth')}
            >
              Comenzar ahora
              <ChevronRight className="w-5 h-5 ml-2" />
            </Button>
            <Button 
              size="lg" 
              variant="outline" 
              className="h-14 px-8 text-lg border-border text-foreground hover:bg-secondary"
              onClick={() => setCurrentScreen('auth')}
            >
              Ver partidos
            </Button>
          </div>
        </div>

        {/* Feature Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-16 max-w-4xl w-full px-4">
          <FeatureCard
            icon={<Target className="w-6 h-6" />}
            title="Busca rival"
            description="Tu equipo vs otro equipo. Programa partidos competitivos."
          />
          <FeatureCard
            icon={<Users className="w-6 h-6" />}
            title="Encuentra jugadores"
            description="Te faltan jugadores? Completa tu equipo facilmente."
          />
          <FeatureCard
            icon={<Shuffle className="w-6 h-6" />}
            title="Revueltas abiertas"
            description="Unete a partidos abiertos y conoce nuevos jugadores."
          />
        </div>
      </main>

      {/* Stats Bar */}
      <div className="border-t border-border bg-secondary/50 py-8">
        <div className="max-w-4xl mx-auto grid grid-cols-3 gap-4 text-center px-4">
          <div>
            <div className="text-2xl md:text-3xl font-bold text-accent">500+</div>
            <div className="text-sm text-muted-foreground">Jugadores</div>
          </div>
          <div>
            <div className="text-2xl md:text-3xl font-bold text-accent">120+</div>
            <div className="text-sm text-muted-foreground">Partidos / mes</div>
          </div>
          <div>
            <div className="text-2xl md:text-3xl font-bold text-accent">15</div>
            <div className="text-sm text-muted-foreground">Canchas</div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-border py-6 px-4">
        <div className="max-w-4xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <span className="text-primary-foreground font-bold">P</span>
            </div>
            <span className="font-semibold text-foreground">Pichanga</span>
          </div>
          <p className="text-sm text-muted-foreground">
            2026 Pichanga. Hecho en Chile.
          </p>
        </div>
      </footer>
    </div>
  )
}

function FeatureCard({ 
  icon, 
  title, 
  description 
}: { 
  icon: React.ReactNode
  title: string
  description: string 
}) {
  return (
    <div className="p-6 rounded-xl bg-card border border-border hover:border-primary/50 transition-colors">
      <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center text-primary mb-4">
        {icon}
      </div>
      <h3 className="font-semibold text-lg text-foreground mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  )
}
