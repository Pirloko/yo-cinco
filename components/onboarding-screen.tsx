'use client'

import { useState, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAppAuth, useAppUI } from '@/lib/app-context'
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
  Sparkles,
} from 'lucide-react'
import {
  getBrowserSupabase,
  isSupabaseConfigured,
} from '@/lib/supabase/client'
import { uploadProfileAvatarFile } from '@/lib/supabase/profile-photo'
import { GeoLocationSelect } from '@/components/geo-location-select'
import { DEFAULT_AVATAR } from '@/lib/supabase/mappers'
import {
  isValidPlayerAgeFromBirthDate,
  maxBirthDateForPlayers,
  minBirthDateForPlayers,
  toIsoDateLocal,
} from '@/lib/age-birthday'
import {
  PLAYER_WHATSAPP_PREFIX,
  buildFullPlayerWhatsapp,
  extractWhatsappSuffix8,
  isCompleteWhatsappSuffix,
  isValidFullPlayerWhatsapp,
  sanitizeWhatsappSuffixInput,
} from '@/lib/player-whatsapp'

/** Imágenes en `public/onboarding/` (servidas en producción con el mismo build). */
const ONBOARDING_HERO_BY_STEP: Record<1 | 2 | 3, string> = {
  1: '/onboarding/step-1.jpg',
  2: '/onboarding/step-2.jpg',
  3: '/onboarding/step-3.jpg',
}

const ONBOARDING_HERO_FALLBACK = ONBOARDING_HERO_BY_STEP[1]

function OnboardingStepHero({
  stepNum,
  title,
  subtitle,
}: {
  stepNum: 1 | 2 | 3
  title: string
  subtitle?: string
}) {
  const [src, setSrc] = useState(ONBOARDING_HERO_BY_STEP[stepNum])

  useEffect(() => {
    setSrc(ONBOARDING_HERO_BY_STEP[stepNum])
  }, [stepNum])

  return (
    <div className="relative -mx-1 mb-6 h-40 sm:h-44 overflow-hidden rounded-2xl border border-border/60 shadow-sm">
      <img
        src={src}
        alt=""
        className="h-full w-full object-cover"
        onError={() => {
          if (src !== ONBOARDING_HERO_FALLBACK) {
            setSrc(ONBOARDING_HERO_FALLBACK)
          }
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/45 to-transparent" />
      <div className="absolute bottom-3 left-4 right-4">
        <p className="text-xs font-medium text-primary flex items-center gap-1">
          <Sparkles className="w-3.5 h-3.5" />
          Paso {stepNum} de 3
        </p>
        <h2 className="text-lg font-bold text-foreground mt-0.5 leading-tight">{title}</h2>
        {subtitle ? (
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{subtitle}</p>
        ) : null}
      </div>
    </div>
  )
}

const POSITIONS: { value: Position; label: string }[] = [
  { value: 'portero', label: 'Portero' },
  { value: 'defensa', label: 'Defensa' },
  { value: 'mediocampista', label: 'Mediocampista' },
  { value: 'delantero', label: 'Delantero' },
]

const LEVELS: { value: Level; label: string; description: string }[] = [
  { value: 'principiante', label: 'Principiante', description: 'Recién empezando' },
  { value: 'intermedio', label: 'Intermedio', description: 'Juego regularmente' },
  { value: 'avanzado', label: 'Avanzado', description: 'Tengo experiencia' },
  { value: 'competitivo', label: 'Competitivo', description: 'Nivel de torneo' },
]

const DAYS = ['Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado', 'Domingo']

function hasRealProfilePhoto(url: string): boolean {
  const u = url?.trim()
  return Boolean(u) && u !== DEFAULT_AVATAR
}

export function OnboardingScreen() {
  const {
    setCurrentScreen,
    onboardingSource,
    setOnboardingSource,
  } = useAppUI()
  const {
    completeOnboarding,
    currentUser,
    bumpProfilePhotoCache,
    avatarDisplayUrl,
  } = useAppAuth()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [photoUploading, setPhotoUploading] = useState(false)
  const [step, setStep] = useState(1)
  const [data, setData] = useState<OnboardingData>({
    name: '',
    birthDate: maxBirthDateForPlayers(),
    gender: currentUser?.gender || 'male',
    whatsappPhone: extractWhatsappSuffix8(currentUser?.whatsappPhone),
    position: 'mediocampista',
    level: 'intermedio',
    availability: [],
    city: 'Rancagua',
    cityId: '',
    photo: '',
  })

  const totalSteps = 3
  const isEditMode = onboardingSource === 'profile_edit'

  useEffect(() => {
    if (!isEditMode || !currentUser) return
    setData({
      name: currentUser.name,
      birthDate: currentUser.birthDate
        ? toIsoDateLocal(currentUser.birthDate)
        : maxBirthDateForPlayers(),
      gender: currentUser.gender,
      whatsappPhone: extractWhatsappSuffix8(currentUser.whatsappPhone),
      position: currentUser.position,
      level: currentUser.level,
      availability: [...currentUser.availability],
      city: currentUser.city,
      cityId: currentUser.cityId,
      photo: currentUser.photo && currentUser.photo !== DEFAULT_AVATAR ? currentUser.photo : '',
    })
    setStep(1)
  }, [isEditMode, currentUser?.id])

  const handleNext = async () => {
    if (step < totalSteps) {
      setStep(step + 1)
    } else {
      const fullWa = buildFullPlayerWhatsapp(data.whatsappPhone)
      if (!isValidFullPlayerWhatsapp(fullWa)) {
        toast.error(
          `Ingresa los 8 dígitos de tu móvil después de ${PLAYER_WHATSAPP_PREFIX}.`
        )
        return
      }
      try {
        await completeOnboarding({ ...data, whatsappPhone: fullWa })
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
      const supabase = getBrowserSupabase()
      if (!supabase) return
      const result = await uploadProfileAvatarFile(supabase, currentUser.id, file)
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      setData((prev) => ({ ...prev, photo: result.publicUrl }))
      bumpProfilePhotoCache()
      toast.success('Foto subida')
    } finally {
      setPhotoUploading(false)
    }
  }

  const toggleAvailability = (day: string) => {
    const dayLower = day.toLowerCase()
    if (data.availability.includes(dayLower)) {
      setData({
        ...data,
        availability: data.availability.filter((d) => d !== dayLower),
      })
    } else {
      setData({ ...data, availability: [...data.availability, dayLower] })
    }
  }

  const canProceed = () => {
    switch (step) {
      case 1:
        return (
          data.name.length >= 2 &&
          isValidPlayerAgeFromBirthDate(data.birthDate) &&
          isCompleteWhatsappSuffix(data.whatsappPhone)
        )
      case 2:
        return true
      case 3:
        return data.availability.length > 0 && hasRealProfilePhoto(data.photo)
      default:
        return false
    }
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
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
          {Array.from({ length: totalSteps }).map((_, i) => {
            const cur = step - 1
            const seg =
              i < cur ? 'w-8 bg-primary' : i === cur ? 'w-8 bg-primary/50' : 'w-2 bg-border'
            return (
              <div key={i} className={`h-2 rounded-full transition-all ${seg}`} />
            )
          })}
        </div>
        <div className="w-10" />
      </header>

      <main className="flex-1 flex flex-col p-4 max-w-md mx-auto w-full">
        {step === 1 && (
          <div className="flex-1 flex flex-col">
            <OnboardingStepHero
              stepNum={1}
              title={isEditMode ? 'Tus datos' : '¡Arma tu perfil!'}
            />

            <div className="space-y-2 mb-6">
              <p className="text-sm text-muted-foreground">
                {isEditMode
                  ? 'Nombre, fecha de nacimiento, WhatsApp y ciudad.'
                  : 'WhatsApp y género son obligatorios; solo verás partidos de tu mismo género.'}
              </p>
            </div>

            <div className="space-y-6 flex-1">
              <div className="space-y-2">
                <Label htmlFor="name" className="text-foreground flex items-center gap-2">
                  <User className="w-4 h-4 text-primary" />
                  Nombre o apodo (como te dicen en la cancha)
                </Label>
                <Input
                  id="name"
                  placeholder="Ej: Pipa, Chino, Pancho..."
                  value={data.name}
                  onChange={(e) => setData({ ...data, name: e.target.value })}
                  className="h-12 bg-secondary border-border text-foreground placeholder:text-muted-foreground"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="birthDate" className="text-foreground flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-primary" />
                  Fecha de nacimiento
                </Label>
                <Input
                  id="birthDate"
                  type="date"
                  min={minBirthDateForPlayers()}
                  max={maxBirthDateForPlayers()}
                  value={data.birthDate}
                  onChange={(e) => setData({ ...data, birthDate: e.target.value })}
                  className="h-12 bg-secondary border-border text-foreground"
                />
                <p className="text-xs text-muted-foreground">
                  edad minima 17 años
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="whatsappPhone" className="text-foreground flex items-center gap-2">
                  <Phone className="w-4 h-4 text-primary" />
                  WhatsApp (obligatorio)
                </Label>
                <div className="flex h-12 min-w-0 rounded-xl border border-border bg-secondary overflow-hidden focus-within:ring-2 focus-within:ring-primary/40">
                  <span
                    className="flex shrink-0 items-center border-r border-border bg-muted/50 px-3 text-sm font-medium text-foreground tabular-nums"
                    aria-hidden
                  >
                    {PLAYER_WHATSAPP_PREFIX}
                  </span>
                  <Input
                    id="whatsappPhone"
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel-national"
                    placeholder="12345678"
                    maxLength={8}
                    value={data.whatsappPhone}
                    onChange={(e) =>
                      setData({
                        ...data,
                        whatsappPhone: sanitizeWhatsappSuffixInput(e.target.value),
                      })
                    }
                    className="h-12 flex-1 min-w-0 border-0 bg-transparent shadow-none rounded-none focus-visible:ring-0 focus-visible:ring-offset-0 text-foreground placeholder:text-muted-foreground"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Solo los 8 dígitos de tu celular (Chile). Lo usaremos para coordinar partidos.
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
                        <User
                          className={`w-6 h-6 ${data.gender === 'male' ? 'text-primary' : 'text-muted-foreground'}`}
                        />
                        <span
                          className={`font-medium ${data.gender === 'male' ? 'text-primary' : 'text-foreground'}`}
                        >
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
                        <User
                          className={`w-6 h-6 ${data.gender === 'female' ? 'text-primary' : 'text-muted-foreground'}`}
                        />
                        <span
                          className={`font-medium ${data.gender === 'female' ? 'text-primary' : 'text-foreground'}`}
                        >
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
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="flex-1 flex flex-col">
            <OnboardingStepHero
              stepNum={2}
              title="Nivel de juego y tu posición"
              subtitle="Así otros jugadores saben qué esperar en la cancha."
            />

            <div className="space-y-8 flex-1">
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
                      <span
                        className={`font-medium block ${
                          data.level === lvl.value ? 'text-primary' : 'text-foreground'
                        }`}
                      >
                        {lvl.label}
                      </span>
                      <span className="text-sm text-muted-foreground">{lvl.description}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <Label className="text-foreground flex items-center gap-2">
                  <User className="w-4 h-4 text-primary" />
                  Posición en cancha
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
                      <span
                        className={`font-medium ${
                          data.position === pos.value ? 'text-primary' : 'text-foreground'
                        }`}
                      >
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
            <OnboardingStepHero
              stepNum={3}
              title="Disponibilidad y foto de perfil"
              subtitle="Elige cuándo puedes jugar y sube una foto (obligatoria)."
            />

            <div className="space-y-8 flex-1">
              <div className="space-y-3">
                <Label className="text-foreground flex items-center gap-2">
                  <Clock className="w-4 h-4 text-primary" />
                  Días disponibles
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
                      <span
                        className={`font-medium ${
                          data.availability.includes(day.toLowerCase())
                            ? 'text-primary'
                            : 'text-foreground'
                        }`}
                      >
                        {day}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <Label className="text-foreground flex items-center gap-2">
                  <Camera className="w-4 h-4 text-primary" />
                  Foto de perfil (obligatoria)
                </Label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="sr-only"
                  onChange={(ev) => void handleProfilePhotoFile(ev)}
                />
                <div className="flex flex-col items-center gap-4">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={photoUploading}
                    className="relative rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-60"
                  >
                    <div className="w-36 h-36 rounded-full bg-secondary border-2 border-dashed border-border flex items-center justify-center overflow-hidden">
                      {photoUploading ? (
                        <Loader2 className="w-10 h-10 text-primary animate-spin" />
                      ) : hasRealProfilePhoto(data.photo) ? (
                        <img
                          src={avatarDisplayUrl(
                            data.photo,
                            currentUser?.id
                          )}
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
                  <Button
                    type="button"
                    variant="default"
                    className="w-full max-w-xs"
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
                  {!hasRealProfilePhoto(data.photo) && (
                    <p className="text-xs text-center text-amber-600 dark:text-amber-400 px-1">
                      Sube la foto de tu ídolo o una foto de perfil tuya.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="pt-6 space-y-3">
          {step === totalSteps && (
            <p className="text-center text-sm font-semibold text-primary">
              {canProceed()
                ? 'perfil listo, vamos a jugar!'
                : 'Activa tus dias y tu foto para salir a la cancha'}
            </p>
          )}
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
