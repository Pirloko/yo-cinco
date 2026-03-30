'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AppScreenBrandHeading } from '@/components/app-screen-brand-heading'
import { useApp } from '@/lib/app-context'
import { ArrowLeft, MapPin } from 'lucide-react'

export function VenueOnboardingScreen() {
  const { logout, completeVenueOnboarding } = useApp()
  const [form, setForm] = useState({
    name: '',
    address: '',
    phone: '',
    city: 'Rancagua',
    mapsUrl: '',
    slotDurationMinutes: 60,
  })
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim() || !form.address.trim() || !form.phone.trim()) return
    setSubmitting(true)
    try {
      await completeVenueOnboarding({
        name: form.name.trim(),
        address: form.address.trim(),
        phone: form.phone.trim(),
        city: form.city.trim() || 'Rancagua',
        mapsUrl: form.mapsUrl.trim() || null,
        slotDurationMinutes: Math.min(
          180,
          Math.max(15, Math.round(Number(form.slotDurationMinutes)) || 60)
        ),
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border p-4">
        <AppScreenBrandHeading
          before={
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => void logout()}
              aria-label="Cerrar sesión"
              className="shrink-0"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
          }
          title="Alta de centro"
          subtitle="Datos públicos de tu recinto"
          titleClassName="text-lg font-semibold"
        />
      </header>

      <main className="flex-1 p-4 max-w-md mx-auto w-full">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="v-name">Nombre del centro</Label>
            <Input
              id="v-name"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Ej: Club San Lorenzo"
              className="bg-secondary border-border"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="v-address" className="flex items-center gap-2">
              <MapPin className="w-4 h-4" />
              Dirección
            </Label>
            <Input
              id="v-address"
              required
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              placeholder="Calle y número"
              className="bg-secondary border-border"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="v-city">Ciudad</Label>
            <Input
              id="v-city"
              value={form.city}
              onChange={(e) => setForm({ ...form, city: e.target.value })}
              className="bg-secondary border-border"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="v-phone">Teléfono</Label>
            <Input
              id="v-phone"
              required
              type="tel"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="+56..."
              className="bg-secondary border-border"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="v-maps">Google Maps (opcional)</Label>
            <Input
              id="v-maps"
              type="url"
              value={form.mapsUrl}
              onChange={(e) => setForm({ ...form, mapsUrl: e.target.value })}
              placeholder="https://maps.app.goo.gl/..."
              className="bg-secondary border-border"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="v-slot">Duración tramo (min)</Label>
            <Input
              id="v-slot"
              type="number"
              min={15}
              max={180}
              step={15}
              value={form.slotDurationMinutes}
              onChange={(e) =>
                setForm({
                  ...form,
                  slotDurationMinutes: Number(e.target.value),
                })
              }
              className="bg-secondary border-border"
            />
            <p className="text-xs text-muted-foreground">
              Usado para calcular huecos en tu página pública y al reservar.
            </p>
          </div>
          <Button
            type="submit"
            className="w-full h-12"
            disabled={submitting}
          >
            {submitting ? 'Guardando…' : 'Crear mi centro'}
          </Button>
        </form>
      </main>
    </div>
  )
}
