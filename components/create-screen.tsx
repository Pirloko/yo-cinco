'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { useApp } from '@/lib/app-context'
import { BottomNav } from '@/components/bottom-nav'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  MatchType,
  Level,
  Team,
  type PlayersSeekProfile,
  type SportsVenue,
} from '@/lib/types'
import { TIME_SLOT_OPTIONS } from '@/lib/time-slot-options'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client'
import { fetchSportsVenuesList } from '@/lib/supabase/venue-queries'
import { readCreatePrefill, clearCreatePrefill } from '@/lib/create-prefill'
import {
  ArrowLeft,
  ArrowRight,
  Target,
  Users,
  Shuffle,
  MapPin,
  Calendar,
  Clock,
  Star,
  CheckCircle,
  Shield,
  Swords,
  Crown,
  ChevronRight,
  Search,
  Info,
} from 'lucide-react'

const CREATE_MATCH_GUIDELINES: string[] = [
  'Respeto y buena convivencia: trata a rivales y compañeros con educación; el fútbol amateur es para pasarlo bien.',
  'Cero violencia: no se toleran agresiones ni provocaciones. Ante un conflicto, mejor cortar el partido y hablar con calma.',
  'Compromiso: si te apuntas o organizas, avisa con tiempo si no puedes ir para no dejar colgados a los demás.',
  'Nivel honesto: elige un nivel de juego acorde al grupo para que el partido sea parejo y entretenido.',
  'Cancha y pagos: la reserva, el pago y la coordinación con la cancha son responsabilidad del organizador (o de quienes acuerden por el chat); la app solo ayuda a juntar gente.',
  'Reglas del lugar: respeta horarios, el reglamento de la cancha y el cuidado de las instalaciones.',
]

const LEVELS: { value: Level; label: string }[] = [
  { value: 'principiante', label: 'Principiante' },
  { value: 'intermedio', label: 'Intermedio' },
  { value: 'avanzado', label: 'Avanzado' },
  { value: 'competitivo', label: 'Competitivo' },
]

const levelLabels: Record<Level, string> = {
  principiante: 'Principiante',
  intermedio: 'Intermedio',
  avanzado: 'Avanzado',
  competitivo: 'Competitivo',
}

export function CreateScreen() {
  const {
    setCurrentScreen,
    currentUser,
    addMatchOpportunity,
    createRivalChallenge,
    getUserTeams,
    getFilteredTeams,
  } = useApp()
  const [step, setStep] = useState(1)
  const [matchType, setMatchType] = useState<MatchType | null>(null)
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null)
  const [selectedRivalTeam, setSelectedRivalTeam] = useState<Team | null>(null)
  const [rivalMode, setRivalMode] = useState<'direct' | 'open'>('direct')
  const [rivalSearch, setRivalSearch] = useState('')
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    teamName: '',
    venue: '',
    location: 'Rancagua',
    date: '',
    time: '',
    level: 'intermedio' as Level,
    playersNeeded: 6,
  })
  const [isSubmitted, setIsSubmitted] = useState(false)
  /** Revuelta: organizador cuenta como un cupo y elige arquero o campo. */
  const [creatorIsGoalkeeper, setCreatorIsGoalkeeper] = useState(false)
  /** Buscar jugadores: qué cupos ofrece (paso 3). */
  const [playersSeekProfile, setPlayersSeekProfile] =
    useState<PlayersSeekProfile | null>(null)
  const [sportsVenuesFromDb, setSportsVenuesFromDb] = useState<SportsVenue[]>(
    []
  )
  const [linkedVenueId, setLinkedVenueId] = useState<string | null>(null)
  const [bookCourtSlot, setBookCourtSlot] = useState(false)

  useEffect(() => {
    const pre = readCreatePrefill()
    if (pre) {
      setLinkedVenueId(pre.sportsVenueId)
      setBookCourtSlot(pre.bookCourtSlot)
      setFormData((f) => ({
        ...f,
        venue: pre.venueLabel,
        location: pre.city,
        date: pre.date,
        time: pre.time,
      }))
      clearCreatePrefill()
    }
    if (!isSupabaseConfigured()) return
    const supabase = createClient()
    void fetchSportsVenuesList(supabase).then(setSportsVenuesFromDb)
  }, [])

  const userTeams = getUserTeams()
  const allTeams = currentUser ? getFilteredTeams(currentUser.gender) : []
  const rivalTeams = allTeams
    .filter(
      (t) => t.id !== selectedTeam?.id && !userTeams.some((ut) => ut.id === t.id)
    )
    .filter((t) => t.name.toLowerCase().includes(rivalSearch.toLowerCase()))

  const handleBack = () => {
    if (step > 1) {
      if (matchType === 'rival' && step === 4) {
        setStep(3)
        setSelectedRivalTeam(null)
      } else if (matchType === 'rival' && step === 3) {
        setStep(2)
      } else if (matchType === 'rival' && step === 2) {
        setStep(1)
        setSelectedTeam(null)
      } else if (matchType === 'players' && step === 4) {
        setStep(3)
      } else if (matchType === 'players' && step === 3) {
        setStep(2)
      } else if (matchType === 'players' && step === 2) {
        setStep(1)
        setPlayersSeekProfile(null)
      } else if (matchType === 'open' && step === 2) {
        setStep(1)
      } else {
        setStep(step - 1)
      }
    } else {
      setCurrentScreen('home')
    }
  }

  const handleSubmit = async () => {
    if (!matchType || !currentUser) return
    if (matchType === 'players' && !playersSeekProfile) return

    const dateTime = new Date(`${formData.date}T${formData.time}`)

    // Rival challenge flow (direct or open)
    if (matchType === 'rival' && selectedTeam) {
      if (rivalMode === 'direct' && !selectedRivalTeam) return
      await createRivalChallenge({
        challengerTeam: selectedTeam,
        mode: rivalMode,
        challengedTeam: rivalMode === 'direct' ? selectedRivalTeam ?? undefined : undefined,
        message: formData.description,
        venue: formData.venue,
        location: formData.location,
        dateTime,
        level: formData.level,
      })
    } else {
      const linked =
        sportsVenuesFromDb.find((x) => x.id === linkedVenueId) ??
        sportsVenuesFromDb.find((x) => x.name === formData.venue.trim())
      await addMatchOpportunity({
        type: matchType,
        title: formData.title,
        description: formData.description,
        teamName: formData.teamName || undefined,
        venue: formData.venue,
        location: formData.location,
        dateTime,
        level: formData.level,
        creatorId: currentUser.id,
        creatorName: currentUser.name,
        creatorPhoto: currentUser.photo,
        playersNeeded: matchType === 'rival' ? undefined : formData.playersNeeded,
        playersJoined: matchType === 'rival' ? undefined : 0,
        gender: currentUser.gender,
        status: 'pending',
        creatorIsGoalkeeper:
          matchType === 'open' ? creatorIsGoalkeeper : undefined,
        playersSeekProfile:
          matchType === 'players' && playersSeekProfile
            ? playersSeekProfile
            : undefined,
        sportsVenueId: linked?.id,
        bookCourtSlot:
          linked && bookCourtSlot ? true : undefined,
        courtSlotMinutes: linked?.slotDurationMinutes,
      })
    }

    setIsSubmitted(true)
  }

  if (isSubmitted) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <div className="text-center space-y-6">
          <div className="w-20 h-20 rounded-full bg-primary/20 flex items-center justify-center mx-auto">
            <CheckCircle className="w-10 h-10 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Publicado!</h1>
            <p className="text-muted-foreground mt-2">
              {matchType === 'rival' && rivalMode === 'direct' && selectedRivalTeam 
                ? `Tu desafio a ${selectedRivalTeam.name} ha sido enviado` 
                : matchType === 'rival' ? 'Tu busqueda de rival ya esta visible'
                : matchType === 'players' ? 'Tu busqueda de jugadores ya esta visible' 
                : 'Tu revuelta ya esta visible'}
            </p>
          </div>
          <Button
            onClick={() => setCurrentScreen('home')}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            Volver al inicio
          </Button>
        </div>
      </div>
    )
  }

  const totalStepsForFlow =
    matchType === 'rival' ? 4 : matchType === 'players' ? 4 : 2

  const showCasualForm =
    (matchType === 'open' && step === 2) ||
    (matchType === 'players' && step === 4)

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <header className="flex items-center gap-4 p-4 border-b border-border">
        <Button
          variant="ghost"
          size="icon"
          onClick={handleBack}
          className="text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-lg font-semibold text-foreground">Crear partido</h1>
          <p className="text-sm text-muted-foreground">
            {matchType === 'rival'
              ? `Paso ${step} de 4`
              : matchType
                ? `Paso ${step} de ${totalStepsForFlow}`
                : 'Paso 1'}
          </p>
        </div>
      </header>

      <main className="p-4">
        {step === 1 && (
          <div className="space-y-6">
            <Card className="border-primary/35 bg-primary/5">
              <CardContent className="p-4">
                <div className="flex gap-3">
                  <Info
                    className="w-5 h-5 text-primary shrink-0 mt-0.5"
                    aria-hidden
                  />
                  <div className="min-w-0 space-y-2">
                    <p className="text-sm font-semibold text-foreground">
                      Antes de publicar
                    </p>
                    <ul className="space-y-2 text-xs text-muted-foreground leading-relaxed">
                      {CREATE_MATCH_GUIDELINES.map((line, i) => (
                        <li key={i} className="flex gap-2">
                          <span className="text-primary shrink-0 select-none">•</span>
                          <span>{line}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="text-center space-y-2">
              <h2 className="text-2xl font-bold text-foreground">Que quieres hacer?</h2>
              <p className="text-muted-foreground">Elige una opcion para comenzar</p>
            </div>

            <div className="space-y-4 mt-8">
              <TypeCard
                icon={<Target className="w-8 h-8" />}
                title="Buscar rival"
                description="Tu equipo vs otro equipo"
                selected={matchType === 'rival'}
                onClick={() => setMatchType('rival')}
                color="red"
              />
              <TypeCard
                icon={<Users className="w-8 h-8" />}
                title="Buscar jugadores"
                description="Te faltan jugadores para completar"
                selected={matchType === 'players'}
                onClick={() => setMatchType('players')}
                color="green"
              />
              <TypeCard
                icon={<Shuffle className="w-8 h-8" />}
                title="Crear revuelta"
                description="Partido abierto para todos"
                selected={matchType === 'open'}
                onClick={() => {
                  setMatchType('open')
                  setFormData((f) => ({
                    ...f,
                    playersNeeded: Math.min(12, Math.max(10, f.playersNeeded)),
                  }))
                }}
                color="gold"
              />
            </div>

            <Button
              onClick={() => {
                if (matchType === 'rival') {
                  if (userTeams.length === 0) {
                    setCurrentScreen('teams')
                  } else {
                    setStep(2)
                  }
                } else {
                  setStep(2)
                }
              }}
              disabled={!matchType}
              className="w-full h-14 mt-8 bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {matchType === 'rival' && userTeams.length === 0 ? 'Crear equipo primero' : 'Continuar'}
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
            
            {matchType === 'rival' && userTeams.length === 0 && (
              <p className="text-center text-sm text-muted-foreground mt-3">
                Necesitas tener un equipo para buscar rival
              </p>
            )}
          </div>
        )}

        {/* Step 2 for Rival: Select your team */}
        {step === 2 && matchType === 'rival' && (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-bold text-foreground">Selecciona tu equipo</h2>
              <p className="text-muted-foreground">Elige el equipo que desafiara</p>
            </div>

            <div className="space-y-3 mt-6">
              {userTeams.map((team) => (
                <Card 
                  key={team.id}
                  onClick={() => setSelectedTeam(team)}
                  className={`bg-card cursor-pointer transition-all ${
                    selectedTeam?.id === team.id 
                      ? 'border-primary ring-2 ring-primary/20' 
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center gap-4">
                      <div className="w-14 h-14 rounded-xl bg-muted overflow-hidden flex-shrink-0">
                        {team.logo ? (
                          <img src={team.logo} alt={team.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-primary/20">
                            <Shield className="w-7 h-7 text-primary" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-foreground">{team.name}</h3>
                          {team.captainId === currentUser?.id && (
                            <Crown className="w-4 h-4 text-accent" />
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="secondary" className="text-xs">
                            {levelLabels[team.level]}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {team.members.length}/6 jugadores
                          </span>
                        </div>
                      </div>
                      <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                        selectedTeam?.id === team.id ? 'border-primary bg-primary' : 'border-border'
                      }`}>
                        {selectedTeam?.id === team.id && <div className="w-2.5 h-2.5 rounded-full bg-background" />}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Button
              onClick={() => setStep(3)}
              disabled={!selectedTeam}
              className="w-full h-14 mt-6 bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              Continuar
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
          </div>
        )}

        {/* Step 3 for Rival: Select rival team */}
        {step === 3 && matchType === 'rival' && selectedTeam && (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-bold text-foreground">Selecciona rival</h2>
              <p className="text-muted-foreground">
                <span className="text-primary font-medium">{selectedTeam.name}</span> puede desafiar directo o publicar búsqueda abierta
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setRivalMode('open')
                  setSelectedRivalTeam(null)
                }}
                className={`p-3 rounded-xl border-2 text-sm font-medium transition-all ${
                  rivalMode === 'open'
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-card text-foreground'
                }`}
              >
                Buscar rival abierto
              </button>
              <button
                type="button"
                onClick={() => setRivalMode('direct')}
                className={`p-3 rounded-xl border-2 text-sm font-medium transition-all ${
                  rivalMode === 'direct'
                    ? 'border-red-500 bg-red-500/10 text-red-400'
                    : 'border-border bg-card text-foreground'
                }`}
              >
                Desafiar equipo específico
              </button>
            </div>

            {rivalMode === 'direct' && (
              <>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar equipo rival..."
                    value={rivalSearch}
                    onChange={(e) => setRivalSearch(e.target.value)}
                    className="pl-10 h-11 bg-secondary border-border"
                  />
                </div>

                <div className="space-y-3 mt-6">
                  {rivalTeams.length > 0 ? (
                    rivalTeams.map((team) => (
                      <Card 
                        key={team.id}
                        onClick={() => setSelectedRivalTeam(team)}
                        className={`bg-card cursor-pointer transition-all ${
                          selectedRivalTeam?.id === team.id 
                            ? 'border-red-500 ring-2 ring-red-500/20' 
                            : 'border-border hover:border-red-500/50'
                        }`}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-center gap-4">
                            <div className="w-14 h-14 rounded-xl bg-muted overflow-hidden flex-shrink-0">
                              {team.logo ? (
                                <img src={team.logo} alt={team.name} className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center bg-red-500/20">
                                  <Shield className="w-7 h-7 text-red-400" />
                                </div>
                              )}
                            </div>
                            <div className="flex-1">
                              <h3 className="font-semibold text-foreground">{team.name}</h3>
                              <div className="flex items-center gap-2 mt-1">
                                <Badge variant="secondary" className="text-xs">
                                  {levelLabels[team.level]}
                                </Badge>
                                <span className="text-xs text-muted-foreground">
                                  {team.members.length}/6 jugadores
                                </span>
                              </div>
                            </div>
                            <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                              selectedRivalTeam?.id === team.id ? 'border-red-500 bg-red-500' : 'border-border'
                            }`}>
                              {selectedRivalTeam?.id === team.id && <div className="w-2.5 h-2.5 rounded-full bg-background" />}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))
                  ) : (
                    <Card className="bg-card border-border border-dashed">
                      <CardContent className="p-8 text-center">
                        <Swords className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                        <p className="text-muted-foreground">No hay equipos rivales disponibles</p>
                        <p className="text-xs text-muted-foreground mt-1">Espera a que otros equipos se registren</p>
                      </CardContent>
                    </Card>
                  )}
                </div>
              </>
            )}

            <Button
              onClick={() => {
                if (selectedTeam) {
                  setFormData((prev) => ({ ...prev, level: selectedTeam.level }))
                }
                setStep(4)
              }}
              disabled={rivalMode === 'direct' && !selectedRivalTeam}
              className="w-full h-14 mt-6 bg-red-500 text-white hover:bg-red-600 disabled:opacity-50"
            >
              <Swords className="w-5 h-5 mr-2" />
              {rivalMode === 'direct' ? 'Desafiar y continuar' : 'Publicar búsqueda y continuar'}
            </Button>
          </div>
        )}

        {/* Step 4 for Rival: Match details */}
        {step === 4 && matchType === 'rival' && selectedTeam && (
          <div className="space-y-6">
            {/* VS Preview */}
            <div className="bg-card rounded-2xl p-6 border border-border">
              <div className="flex items-center justify-center gap-4">
                <div className="text-center">
                  <div className="w-16 h-16 rounded-xl bg-muted overflow-hidden mx-auto mb-2">
                    {selectedTeam.logo ? (
                      <img src={selectedTeam.logo} alt={selectedTeam.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-primary/20">
                        <Shield className="w-8 h-8 text-primary" />
                      </div>
                    )}
                  </div>
                  <p className="font-semibold text-foreground text-sm">{selectedTeam.name}</p>
                </div>
                <div className="px-4">
                  <span className="text-2xl font-bold text-accent">VS</span>
                </div>
                <div className="text-center">
                  <div className="w-16 h-16 rounded-xl bg-muted overflow-hidden mx-auto mb-2">
                    {rivalMode === 'direct' && selectedRivalTeam?.logo ? (
                      <img src={selectedRivalTeam.logo} alt={selectedRivalTeam.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-red-500/20">
                        <Shield className="w-8 h-8 text-red-400" />
                      </div>
                    )}
                  </div>
                  <p className="font-semibold text-foreground text-sm">
                    {rivalMode === 'direct'
                      ? selectedRivalTeam?.name
                      : 'Rival por confirmar'}
                  </p>
                </div>
              </div>
            </div>

            <div className="text-center">
              <h2 className="text-xl font-bold text-foreground">Detalles del desafio</h2>
            </div>

            <div className="space-y-4">
              {/* Description */}
              <div className="space-y-2">
                <Label className="text-foreground">Mensaje (opcional)</Label>
                <Textarea
                  placeholder="Ej: Los esperamos, vengan preparados..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="bg-secondary border-border text-foreground placeholder:text-muted-foreground resize-none"
                  rows={2}
                />
              </div>

              <CanchaLugarSelect
                label={
                  <>
                    <MapPin className="w-4 h-4 text-primary" />
                    Cancha propuesta
                  </>
                }
                sportsVenues={sportsVenuesFromDb}
                linkedVenueId={linkedVenueId}
                venue={formData.venue}
                onVenueChange={({ linkedVenueId: id, venue, city }) => {
                  setLinkedVenueId(id)
                  setBookCourtSlot(false)
                  setFormData((f) => ({
                    ...f,
                    venue,
                    ...(city !== undefined ? { location: city } : {}),
                  }))
                }}
                showBookCheckbox={false}
              />

              {/* Date and Time */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-foreground flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-primary" />
                    Fecha
                  </Label>
                  <Input
                    type="date"
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    className="h-12 bg-secondary border-border text-foreground"
                  />
                </div>
                <HoraSlotSelect
                  value={formData.time}
                  onValueChange={(time) => setFormData({ ...formData, time })}
                />
              </div>

              <div className="space-y-2">
                <Label className="text-foreground flex items-center gap-2">
                  <Star className="w-4 h-4 text-primary" />
                  Nivel del partido
                </Label>
                <div className="grid grid-cols-2 gap-2">
                  {LEVELS.map((lvl) => (
                    <button
                      key={lvl.value}
                      type="button"
                      onClick={() => setFormData({ ...formData, level: lvl.value })}
                      className={`p-3 rounded-xl border-2 transition-all text-center ${
                        formData.level === lvl.value
                          ? 'border-red-500 bg-red-500/10'
                          : 'border-border bg-secondary hover:border-muted-foreground'
                      }`}
                    >
                      <span
                        className={`font-medium text-sm ${
                          formData.level === lvl.value ? 'text-red-400' : 'text-foreground'
                        }`}
                      >
                        {lvl.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <Button
              onClick={handleSubmit}
              disabled={!formData.venue || !formData.date || !formData.time}
              className="w-full h-14 mt-4 bg-red-500 text-white hover:bg-red-600 disabled:opacity-50"
            >
              <Swords className="w-5 h-5 mr-2" />
              {rivalMode === 'direct' ? 'Enviar desafío' : 'Publicar búsqueda de rival'}
            </Button>
          </div>
        )}

        {/* Step 2: buscar jugadores — cantidad */}
        {step === 2 && matchType === 'players' && (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-bold text-foreground">
                ¿Cuántos jugadores necesitas?
              </h2>
              <p className="text-sm text-muted-foreground">
                Solo cuentan quienes se sumen a la búsqueda; tú no ocupas cupo.
              </p>
            </div>
            <div className="space-y-2">
              <Label className="text-foreground flex items-center gap-2">
                <Users className="w-4 h-4 text-primary" />
                Cantidad
              </Label>
              <div className="flex items-center justify-center gap-4 py-2">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() =>
                    setFormData({
                      ...formData,
                      playersNeeded: Math.max(1, formData.playersNeeded - 1),
                    })
                  }
                  className="border-border h-12 w-12"
                >
                  -
                </Button>
                <span className="text-3xl font-bold text-foreground w-14 text-center">
                  {formData.playersNeeded}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() =>
                    setFormData({
                      ...formData,
                      playersNeeded: Math.min(12, formData.playersNeeded + 1),
                    })
                  }
                  className="border-border h-12 w-12"
                >
                  +
                </Button>
              </div>
            </div>
            <Button
              onClick={() => setStep(3)}
              className="w-full h-14 mt-6 bg-primary text-primary-foreground hover:bg-primary/90"
            >
              Continuar
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
          </div>
        )}

        {/* Step 3: buscar jugadores — tipo de cupos */}
        {step === 3 && matchType === 'players' && (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-bold text-foreground">
                ¿Qué te falta completar?
              </h2>
              <p className="text-sm text-muted-foreground">
                Necesitas {formData.playersNeeded}{' '}
                {formData.playersNeeded === 1 ? 'jugador' : 'jugadores'} en total.
              </p>
            </div>
            <div className="flex flex-col gap-3">
              {(
                [
                  ['gk_only', 'Solo arquero(s)', 'Buscan uno o más arqueros.'] as const,
                  [
                    'field_only',
                    'Solo jugadores de campo',
                    'No necesitan arquero en esta búsqueda.',
                  ] as const,
                  [
                    'gk_and_field',
                    'Arquero y jugadores de campo',
                    'Máximo 1 arquero y el resto de campo.',
                  ] as const,
                ] as const
              ).map(([value, title, desc]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setPlayersSeekProfile(value)}
                  className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                    playersSeekProfile === value
                      ? 'border-primary bg-primary/10'
                      : 'border-border bg-card hover:border-primary/40'
                  }`}
                >
                  <p className="font-semibold text-foreground">{title}</p>
                  <p className="text-xs text-muted-foreground mt-1">{desc}</p>
                </button>
              ))}
            </div>
            <Button
              onClick={() => setStep(4)}
              disabled={!playersSeekProfile}
              className="w-full h-14 mt-2 bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              Continuar al formulario
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
          </div>
        )}

        {/* Formulario: revuelta (paso 2) o buscar jugadores (paso 4) */}
        {showCasualForm && matchType && (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <h2 className="text-xl font-bold text-foreground">
                {matchType === 'players' && 'Detalles de la busqueda'}
                {matchType === 'open' && 'Detalles de la revuelta'}
              </h2>
            </div>

            <div className="space-y-4">
              {/* Title */}
              <div className="space-y-2">
                <Label className="text-foreground">Titulo</Label>
                <Input
                  placeholder={
                    matchType === 'players'
                      ? 'Ej: Faltan 2 jugadores'
                      : 'Ej: Pichanga domingo en la tarde'
                  }
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="h-12 bg-secondary border-border text-foreground placeholder:text-muted-foreground"
                />
              </div>

              {/* Description */}
              <div className="space-y-2">
                <Label className="text-foreground">Descripcion (opcional)</Label>
                <Textarea
                  placeholder="Agrega mas detalles..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="bg-secondary border-border text-foreground placeholder:text-muted-foreground resize-none"
                  rows={3}
                />
              </div>

              {/* Team Name (players flow en este paso) */}
              {matchType === 'players' && (
                <div className="space-y-2">
                  <Label className="text-foreground">Nombre del equipo</Label>
                  <Input
                    placeholder="Ej: Los Cracks FC"
                    value={formData.teamName}
                    onChange={(e) => setFormData({ ...formData, teamName: e.target.value })}
                    className="h-12 bg-secondary border-border text-foreground placeholder:text-muted-foreground"
                  />
                </div>
              )}

              {matchType === 'players' && (
                <div className="rounded-xl border border-border bg-secondary/40 p-3 text-sm text-muted-foreground space-y-1">
                  <p>
                    <span className="text-foreground font-medium">
                      {formData.playersNeeded}
                    </span>{' '}
                    {formData.playersNeeded === 1 ? 'cupo' : 'cupos'} ·{' '}
                    {playersSeekProfile === 'gk_only' && 'Solo arquero(s)'}
                    {playersSeekProfile === 'field_only' && 'Solo jugadores de campo'}
                    {playersSeekProfile === 'gk_and_field' &&
                      'Arquero (máx. 1) + jugadores de campo'}
                  </p>
                </div>
              )}

              {/* Jugadores necesarios solo revuelta (open) */}
              {matchType === 'open' && (
                <div className="space-y-2">
                  <Label className="text-foreground flex items-center gap-2">
                    <Users className="w-4 h-4 text-primary" />
                    Jugadores necesarios
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Total en cancha (incluye tu cupo como organizador). Mín. 10 · Máx. 12.
                  </p>
                  <div className="flex items-center gap-4">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() =>
                        setFormData({
                          ...formData,
                          playersNeeded: Math.max(
                            10,
                            formData.playersNeeded - 1
                          ),
                        })
                      }
                      className="border-border"
                    >
                      -
                    </Button>
                    <span className="text-2xl font-bold text-foreground w-12 text-center">
                      {formData.playersNeeded}
                    </span>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() =>
                        setFormData({
                          ...formData,
                          playersNeeded: Math.min(12, formData.playersNeeded + 1),
                        })
                      }
                      className="border-border"
                    >
                      +
                    </Button>
                  </div>
                </div>
              )}

              {matchType === 'open' && (
                <div className="space-y-2">
                  <Label className="text-foreground flex items-center gap-2">
                    <Shield className="w-4 h-4 text-primary" />
                    Tu rol en la revuelta
                  </Label>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant={!creatorIsGoalkeeper ? 'default' : 'outline'}
                      className="flex-1 h-11"
                      onClick={() => setCreatorIsGoalkeeper(false)}
                    >
                      Jugador de campo
                    </Button>
                    <Button
                      type="button"
                      variant={creatorIsGoalkeeper ? 'default' : 'outline'}
                      className="flex-1 h-11"
                      onClick={() => setCreatorIsGoalkeeper(true)}
                    >
                      Arquero
                    </Button>
                  </div>
                </div>
              )}

              <CanchaLugarSelect
                label={
                  <>
                    <MapPin className="w-4 h-4 text-primary" />
                    Cancha / Lugar
                  </>
                }
                sportsVenues={sportsVenuesFromDb}
                linkedVenueId={linkedVenueId}
                venue={formData.venue}
                onVenueChange={({ linkedVenueId: id, venue, city }) => {
                  setLinkedVenueId(id)
                  setBookCourtSlot(!!id)
                  setFormData((f) => ({
                    ...f,
                    venue,
                    ...(city !== undefined ? { location: city } : {}),
                  }))
                }}
                showBookCheckbox
                bookCourtSlot={bookCourtSlot}
                onBookCourtSlotChange={setBookCourtSlot}
              />

              {/* Date and Time */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-foreground flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-primary" />
                    Fecha
                  </Label>
                  <Input
                    type="date"
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    className="h-12 bg-secondary border-border text-foreground"
                  />
                </div>
                <HoraSlotSelect
                  value={formData.time}
                  onValueChange={(time) => setFormData({ ...formData, time })}
                />
              </div>

              {/* Level */}
              <div className="space-y-2">
                <Label className="text-foreground flex items-center gap-2">
                  <Star className="w-4 h-4 text-primary" />
                  Nivel
                </Label>
                <div className="grid grid-cols-2 gap-2">
                  {LEVELS.map((lvl) => (
                    <button
                      key={lvl.value}
                      type="button"
                      onClick={() => setFormData({ ...formData, level: lvl.value })}
                      className={`p-3 rounded-xl border-2 transition-all text-center ${
                        formData.level === lvl.value
                          ? 'border-primary bg-primary/10'
                          : 'border-border bg-secondary hover:border-muted-foreground'
                      }`}
                    >
                      <span className={`font-medium text-sm ${
                        formData.level === lvl.value ? 'text-primary' : 'text-foreground'
                      }`}>
                        {lvl.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <Button
              onClick={handleSubmit}
              disabled={!formData.title || !formData.venue || !formData.date || !formData.time}
              className="w-full h-14 mt-4 bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              Publicar
            </Button>
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  )
}

const CANCHA_DB_PREFIX = 'db:'

function canchaSelectValue(
  linkedVenueId: string | null,
  venue: string,
  sportsVenues: SportsVenue[]
): string | undefined {
  if (linkedVenueId) return `${CANCHA_DB_PREFIX}${linkedVenueId}`
  const byName = sportsVenues.find((v) => v.name === venue)
  if (byName) return `${CANCHA_DB_PREFIX}${byName.id}`
  return undefined
}

function CanchaLugarSelect({
  label,
  sportsVenues,
  linkedVenueId,
  venue,
  onVenueChange,
  showBookCheckbox,
  bookCourtSlot,
  onBookCourtSlotChange,
}: {
  label: ReactNode
  sportsVenues: SportsVenue[]
  linkedVenueId: string | null
  venue: string
  onVenueChange: (p: {
    linkedVenueId: string | null
    venue: string
    city?: string
  }) => void
  /** Mostrar checkbox de reserva automática (solo revuelta / buscar jugadores). */
  showBookCheckbox?: boolean
  bookCourtSlot?: boolean
  onBookCourtSlotChange?: (v: boolean) => void
}) {
  const selectValue = canchaSelectValue(linkedVenueId, venue, sportsVenues)

  return (
    <div className="space-y-2">
      <Label className="text-foreground flex items-center gap-2">{label}</Label>
      {sportsVenues.length === 0 ? (
        <p className="text-sm text-muted-foreground rounded-lg border border-dashed border-border px-3 py-3">
          No hay centros deportivos registrados en la app. Cuando un centro se
          dé de alta, aparecerá aquí.
        </p>
      ) : (
        <Select
          value={selectValue}
          onValueChange={(v) => {
            if (!v.startsWith(CANCHA_DB_PREFIX)) return
            const id = v.slice(CANCHA_DB_PREFIX.length)
            const sv = sportsVenues.find((x) => x.id === id)
            if (!sv) return
            onVenueChange({
              linkedVenueId: id,
              venue: sv.name,
              city: sv.city,
            })
          }}
        >
          <SelectTrigger className="w-full h-12 bg-secondary border-border text-foreground">
            <SelectValue placeholder="Selecciona un centro deportivo" />
          </SelectTrigger>
          <SelectContent className="max-h-[min(24rem,var(--radix-select-content-available-height))]">
            {sportsVenues.map((sv) => (
              <SelectItem key={sv.id} value={`${CANCHA_DB_PREFIX}${sv.id}`}>
                {sv.name} — {sv.city}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {showBookCheckbox && linkedVenueId ? (
        <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
          <input
            type="checkbox"
            className="rounded border-border"
            checked={bookCourtSlot === true}
            onChange={(e) => onBookCourtSlotChange?.(e.target.checked)}
          />
          Reservar cancha automática al publicar (asigna una cancha libre)
        </label>
      ) : null}
    </div>
  )
}

function HoraSlotSelect({
  value,
  onValueChange,
}: {
  value: string
  onValueChange: (time: string) => void
}) {
  return (
    <div className="space-y-2">
      <Label className="text-foreground flex items-center gap-2">
        <Clock className="w-4 h-4 text-primary" />
        Hora
      </Label>
      <Select value={value || undefined} onValueChange={onValueChange}>
        <SelectTrigger className="w-full h-12 bg-secondary border-border text-foreground">
          <SelectValue placeholder="Selecciona la hora" />
        </SelectTrigger>
        <SelectContent>
          {TIME_SLOT_OPTIONS.map(({ value: v, label }) => (
            <SelectItem key={v} value={v}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

function TypeCard({
  icon,
  title,
  description,
  selected,
  onClick,
  color,
}: {
  icon: ReactNode
  title: string
  description: string
  selected: boolean
  onClick: () => void
  color: 'red' | 'green' | 'gold'
}) {
  const colorClasses = {
    red: selected ? 'border-red-500 bg-red-500/10' : 'border-border hover:border-red-500/50',
    green: selected ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50',
    gold: selected ? 'border-accent bg-accent/10' : 'border-border hover:border-accent/50',
  }

  const iconColors = {
    red: 'text-red-400',
    green: 'text-primary',
    gold: 'text-accent',
  }

  return (
    <button
      onClick={onClick}
      className={`w-full p-6 rounded-2xl border-2 transition-all flex items-center gap-4 ${colorClasses[color]}`}
    >
      <div className={`p-3 rounded-xl ${
        color === 'red' ? 'bg-red-500/20' :
        color === 'green' ? 'bg-primary/20' :
        'bg-accent/20'
      }`}>
        <span className={iconColors[color]}>{icon}</span>
      </div>
      <div className="text-left flex-1">
        <h3 className="font-semibold text-lg text-foreground">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
        selected ? `border-${color === 'gold' ? 'accent' : color === 'green' ? 'primary' : 'red-500'} bg-${color === 'gold' ? 'accent' : color === 'green' ? 'primary' : 'red-500'}` : 'border-border'
      }`}>
        {selected && <div className="w-2.5 h-2.5 rounded-full bg-background" />}
      </div>
    </button>
  )
}
