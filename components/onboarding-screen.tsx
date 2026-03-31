'use client'

import { useState, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useApp } from '@/lib/app-context'
import { Position, Level, OnboardingData } from '@/lib/types'
import {
  ArrowLeft,
  ArrowRight,
  User,
  Users,
  Calendar,
  Star,
  Clock,
  Camera,
  Loader2,
  ImagePlus,
  Phone,
} from 'lucide-react'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client'
import { uploadProfileAvatarFile } from '@/lib/supabase/profile-photo'
import { GeoLocationSelect } from '@/components/geo-location-select'

const POSITIONS: { value: Position; label: string }[] = [
  { value: 'portero', label: 'Portero' },
  { value: 'defensa', label: 'Defensa' },
  { value: 'mediocampista', label: 'Mediocampista' },
  { value: 'delantero', label: 'Delantero' },
]

const LEVELS: { value: Level; label: string; description: string }[] = [
  { value: 'principiante', label: 'Principiante', description: 'Recien empezando' },
  { value: 'intermedio', label: 'Intermedio', description: 'Juego regularmente' },
  { value: 'avanzado', label: 'Avanzado', description: 'Tengo experiencia' },
  { value: 'competitivo', label: 'Competitivo', description: 'Nivel de torneo' },
]

const DAYS = ['Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado', 'Domingo']

export function OnboardingScreen() {
  const {
    setCurrentScreen,
    completeOnboarding,
    currentUser,
    onboardingSource,
    setOnboardingSource,
  } = useApp()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [photoUploading, setPhotoUploading] = useState(false)
  const [step, setStep] = useState(1)
  const [data, setData] = useState<OnboardingData>({
    name: '',
    age: 0,
    gender: currentUser?.gender || 'male',
    whatsappPhone: currentUser?.whatsappPhone || '',
    position: 'mediocampista',
    level: 'intermedio',
    availability: [],
    city: 'Rancagua',
    cityId: '',
    photo: '',
  })

  const totalSteps = 4
  const isEditMode = onboardingSource === 'profile_edit'

  useEffect(() => {
    if (!isEditMode || !currentUser) return
    setData({
      name: currentUser.name,
      age: currentUser.age,
      gender: currentUser.gender,
      whatsappPhone: currentUser.whatsappPhone || '',
      position: currentUser.position,
      level: currentUser.level,
      availability: [...currentUser.availability],
      city: currentUser.city,
      cityId: currentUser.cityId,
      photo: currentUser.photo || '',
    })
    setStep(1)
  }, [isEditMode, currentUser?.id])

  const handleNext = async () => {
    if (step < totalSteps) {
      setStep(step + 1)
    } else {
      try {
        await completeOnboarding(data)
      } catch {
        toast.error('No se pudo guardar el perfil')
      }
    }
  }

  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1)
    } else if (isEditMode) {
      setOnboardingSource('registration')
      setCurrentScreen('profile')
    } else {
      setCurrentScreen('auth')
    }
  }

  const handleProfilePhotoFile = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !currentUser) return
    if (!isSupabaseConfigured()) {
      toast.error('Configura Supabase para subir fotos.')
      return
    }
    setPhotoUploading(true)
    try {
      const supabase = createClient()
      const result = await uploadProfileAvatarFile(supabase, currentUser.id, file)
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      setData((prev) => ({ ...prev, photo: result.publicUrl }))
      toast.success('Foto subida')
    } finally {
      setPhotoUploading(false)
    }
  }

  const toggleAvailability = (day: string) => {
    const dayLower = day.toLowerCase()
    if (data.availability.includes(dayLower)) {
      setData({ ...data, availability: data.availability.filter(d => d !== dayLower) })
    } else {
      setData({ ...data, availability: [...data.availability, dayLower] })
    }
  }

  const canProceed = () => {
    switch (step) {
      case 1:
        return (
          data.name.length >= 2 &&
          data.age >= 16 &&
          data.whatsappPhone.trim().length >= 8
        )
      case 2:
        return true
      case 3:
        return data.availability.length > 0
      case 4:
        return true
      default:
        return false
    }
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between p-4">
        <Button 
          variant="ghost" 
          size="icon"
          onClick={handleBack}
          className="text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex items-center gap-2">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div
              key={i}
              className={`h-2 rounded-full transition-all ${
                i < step ? 'w-8 bg-primary' : i === step ? 'w-8 bg-primary/50' : 'w-2 bg-border'
              }`}
            />
          ))}
        </div>
        <div className="w-10" />
      </header>

      {/* Content */}
      <main className="flex-1 flex flex-col p-4 max-w-md mx-auto w-full">
        {step === 1 && (
          <div className="flex-1 flex flex-col">
            <div className="space-y-2 mb-8">
              <h1 className="text-2xl font-bold text-foreground">
                {isEditMode ? 'Editar datos' : 'Información básica'}
              </h1>
              <p className="text-muted-foreground">
                {isEditMode
                  ? 'Actualiza tu nombre, edad, ciudad y nivel'
                  : 'WhatsApp y género son obligatorios; solo verás partidos de tu mismo género.'}
              </p>
            </div>

            <div className="space-y-6 flex-1">
              <div className="space-y-2">
                <Label htmlFor="name" className="text-foreground flex items-center gap-2">
                  <User className="w-4 h-4 text-primary" />
                  Nombre
                </Label>
                <Input
                  id="name"
                  placeholder="Tu nombre"
                  value={data.name}
                  onChange={(e) => setData({ ...data, name: e.target.value })}
                  className="h-12 bg-secondary border-border text-foreground placeholder:text-muted-foreground"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="age" className="text-foreground flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-primary" />
                  Edad
                </Label>
                <Input
                  id="age"
                  type="number"
                  placeholder="Tu edad"
                  min={16}
                  max={99}
                  value={data.age || ''}
                  onChange={(e) => setData({ ...data, age: parseInt(e.target.value) || 0 })}
                  className="h-12 bg-secondary border-border text-foreground placeholder:text-muted-foreground"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="whatsappPhone" className="text-foreground flex items-center gap-2">
                  <Phone className="w-4 h-4 text-primary" />
                  WhatsApp (obligatorio)
                </Label>
                <Input
                  id="whatsappPhone"
                  type="tel"
                  inputMode="tel"
                  placeholder="+56912345678"
                  value={data.whatsappPhone}
                  onChange={(e) =>
                    setData({ ...data, whatsappPhone: e.target.value })
                  }
                  className="h-12 bg-secondary border-border text-foreground placeholder:text-muted-foreground"
                />
                <p className="text-xs text-muted-foreground">
                  Lo usaremos para coordinar partidos.
                </p>
              </div>

              <div className="space-y-3">
                <Label className="text-foreground flex items-center gap-2">
                  <Users className="w-4 h-4 text-primary" />
                  Género
                </Label>
                {isEditMode ? (
                  <>
                    <div className="rounded-xl border border-border bg-secondary/60 px-4 py-3 text-center font-medium text-foreground">
                      {data.gender === 'male' ? 'Masculino' : 'Femenino'}
                    </div>
                    <p className="text-xs text-muted-foreground text-center">
                      El género no se puede cambiar después de crear la cuenta.
                    </p>
                  </>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setData({ ...data, gender: 'male' })}
                        className={`p-4 rounded-xl border-2 transition-all flex flex-col items-center gap-2 ${
                          data.gender === 'male'
                            ? 'border-primary bg-primary/10'
                            : 'border-border bg-secondary hover:border-muted-foreground'
                        }`}
                      >
                        <User className={`w-6 h-6 ${data.gender === 'male' ? 'text-primary' : 'text-muted-foreground'}`} />
                        <span className={`font-medium ${data.gender === 'male' ? 'text-primary' : 'text-foreground'}`}>
                          Masculino
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setData({ ...data, gender: 'female' })}
                        className={`p-4 rounded-xl border-2 transition-all flex flex-col items-center gap-2 ${
                          data.gender === 'female'
                            ? 'border-primary bg-primary/10'
                            : 'border-border bg-secondary hover:border-muted-foreground'
                        }`}
                      >
                        <User className={`w-6 h-6 ${data.gender === 'female' ? 'text-primary' : 'text-muted-foreground'}`} />
                        <span className={`font-medium ${data.gender === 'female' ? 'text-primary' : 'text-foreground'}`}>
                          Femenino
                        </span>
                      </button>
                    </div>
                    <p className="text-xs text-muted-foreground text-center">
                      Solo verás partidos y jugadores de tu mismo género. No podrás cambiarlo después.
                    </p>
                  </>
                )}
              </div>

              <GeoLocationSelect
                cityId={data.cityId}
                onChange={(next) =>
                  setData({
                    ...data,
                    cityId: next.cityId,
                    city: next.cityLabel,
                  })
                }
                label="Ciudad / ubicación"
              />

              <div className="space-y-3">
                <Label className="text-foreground flex items-center gap-2">
                  <Star className="w-4 h-4 text-primary" />
                  Nivel de juego
                </Label>
                <div className="space-y-2">
                  {LEVELS.map((lvl) => (
                    <button
                      key={lvl.value}
                      type="button"
                      onClick={() => setData({ ...data, level: lvl.value })}
                      className={`w-full p-4 rounded-xl border-2 transition-all text-left ${
                        data.level === lvl.value
                          ? 'border-primary bg-primary/10'
                          : 'border-border bg-secondary hover:border-muted-foreground'
                      }`}
                    >
                      <span className={`font-medium block ${
                        data.level === lvl.value ? 'text-primary' : 'text-foreground'
                      }`}>
                        {lvl.label}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {lvl.description}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="flex-1 flex flex-col">
            <div className="space-y-2 mb-8">
              <h1 className="text-2xl font-bold text-foreground">Tu posición</h1>
              <p className="text-muted-foreground">¿Dónde te ubicas en la cancha?</p>
            </div>

            <div className="space-y-6 flex-1">
              <div className="space-y-3">
                <Label className="text-foreground flex items-center gap-2">
                  <User className="w-4 h-4 text-primary" />
                  Posición
                </Label>
                <div className="grid grid-cols-2 gap-3">
                  {POSITIONS.map((pos) => (
                    <button
                      key={pos.value}
                      type="button"
                      onClick={() => setData({ ...data, position: pos.value })}
                      className={`p-4 rounded-xl border-2 transition-all text-center ${
                        data.position === pos.value
                          ? 'border-primary bg-primary/10'
                          : 'border-border bg-secondary hover:border-muted-foreground'
                      }`}
                    >
                      <span className={`font-medium ${
                        data.position === pos.value ? 'text-primary' : 'text-foreground'
                      }`}>
                        {pos.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="flex-1 flex flex-col">
            <div className="space-y-2 mb-8">
              <h1 className="text-2xl font-bold text-foreground">Disponibilidad</h1>
              <p className="text-muted-foreground">Cuando puedes jugar?</p>
            </div>

            <div className="space-y-3 flex-1">
              <Label className="text-foreground flex items-center gap-2">
                <Clock className="w-4 h-4 text-primary" />
                Dias disponibles
              </Label>
              <div className="grid grid-cols-2 gap-3">
                {DAYS.map((day) => (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleAvailability(day)}
                    className={`p-4 rounded-xl border-2 transition-all text-center ${
                      data.availability.includes(day.toLowerCase())
                        ? 'border-primary bg-primary/10'
                        : 'border-border bg-secondary hover:border-muted-foreground'
                    }`}
                  >
                    <span className={`font-medium ${
                      data.availability.includes(day.toLowerCase()) ? 'text-primary' : 'text-foreground'
                    }`}>
                      {day}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="flex-1 flex flex-col">
            <div className="space-y-2 mb-8">
              <h1 className="text-2xl font-bold text-foreground">Foto de perfil</h1>
              <p className="text-muted-foreground">
                Sube una imagen tuya (JPG, PNG, WebP o GIF, máx. 2 MB). Opcional:
                puedes saltar este paso y añadirla después desde Perfil.
              </p>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="sr-only"
              onChange={(ev) => void handleProfilePhotoFile(ev)}
            />

            <div className="flex-1 flex flex-col items-center justify-center gap-4">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={photoUploading}
                className="relative rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-60"
              >
                <div className="w-40 h-40 rounded-full bg-secondary border-2 border-dashed border-border flex items-center justify-center overflow-hidden">
                  {photoUploading ? (
                    <Loader2 className="w-10 h-10 text-primary animate-spin" />
                  ) : data.photo ? (
                    <img
                      src={data.photo}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Camera className="w-12 h-12 text-muted-foreground" />
                  )}
                </div>
                <span className="absolute bottom-1 right-1 flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md ring-4 ring-card">
                  <ImagePlus className="w-5 h-5" />
                </span>
              </button>

              <div className="flex flex-col w-full gap-2 max-w-xs">
                <Button
                  type="button"
                  variant="default"
                  className="w-full"
                  disabled={photoUploading}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {photoUploading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Subiendo…
                    </>
                  ) : (
                    <>
                      <ImagePlus className="w-4 h-4 mr-2" />
                      Elegir foto
                    </>
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full border-border text-foreground hover:bg-secondary"
                  disabled={photoUploading}
                  onClick={() =>
                    setData({
                      ...data,
                      photo:
                        'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=400&fit=crop&crop=face',
                    })
                  }
                >
                  Usar foto de ejemplo
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Bottom Button */}
        <div className="pt-6">
          <Button
            onClick={handleNext}
            disabled={!canProceed()}
            className="w-full h-14 text-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {step === totalSteps
              ? isEditMode
                ? 'Guardar cambios'
                : 'Completar'
              : 'Continuar'}
            <ArrowRight className="w-5 h-5 ml-2" />
          </Button>
        </div>
      </main>
    </div>
  )
}
