'use client'

import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { toast } from 'sonner'
import { useApp } from '@/lib/app-context'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client'
import {
  deleteTeamLogoFile,
  uploadTeamLogoFile,
} from '@/lib/supabase/team-logos'
import { AppScreenBrandHeading } from '@/components/app-screen-brand-heading'
import { BottomNav } from './bottom-nav'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Plus,
  Users,
  Crown,
  ChevronRight,
  UserPlus,
  Check,
  X,
  Shield,
  ArrowLeft,
  Search,
  Camera,
  Trash2,
  Loader2,
  Share2,
  Link2,
  Handshake,
  MessageCircle,
  ScrollText,
  ExternalLink,
} from 'lucide-react'
import {
  Team,
  Level,
  Position,
  type TeamJoinRequest,
  type TeamPrivateSettings,
} from '@/lib/types'
import { fetchTeamPrivateSettings } from '@/lib/supabase/team-queries'
import { teamInviteAbsoluteUrl } from '@/lib/team-invite-url'
import { saveRivalTargetTeamId } from '@/lib/rival-prefill'

type TeamsView = 'list' | 'create' | 'detail' | 'invite'

const levelLabels: Record<Level, string> = {
  principiante: 'Principiante',
  intermedio: 'Intermedio',
  avanzado: 'Avanzado',
  competitivo: 'Competitivo',
}

const positionLabels: Record<Position, string> = {
  portero: 'Portero',
  defensa: 'Defensa',
  mediocampista: 'Medio',
  delantero: 'Delantero',
}

export function TeamsScreen() {
  const {
    currentUser,
    teams,
    getUserTeams,
    getFilteredTeams,
    createTeam,
    updateTeam,
    deleteTeam,
    leaveTeam,
    updateTeamPrivateSettings,
    inviteToTeam,
    teamInvites,
    rivalChallenges,
    respondToRivalChallenge,
    respondToInvite,
    teamJoinRequests,
    requestToJoinTeam,
    respondToJoinRequest,
    cancelJoinRequest,
    getFilteredUsers,
    teamsDetailFocusTeamId,
    setTeamsDetailFocusTeamId,
    setCurrentScreen,
  } = useApp()
  
  const [view, setView] = useState<TeamsView>('list')
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedAcceptTeamByChallenge, setSelectedAcceptTeamByChallenge] =
    useState<Record<string, string>>({})
  
  // Create team form state
  const [teamName, setTeamName] = useState('')
  const [teamLevel, setTeamLevel] = useState<Level>('intermedio')
  const [teamDescription, setTeamDescription] = useState('')
  const [draftTeamName, setDraftTeamName] = useState('')
  const [draftTeamDescription, setDraftTeamDescription] = useState('')
  const [teamDetailEditing, setTeamDetailEditing] = useState(false)
  const [logoCacheBust, setLogoCacheBust] = useState(0)
  const [savingTeam, setSavingTeam] = useState(false)
  const [memberPrivateSettings, setMemberPrivateSettings] =
    useState<TeamPrivateSettings | null>(null)
  const [loadingPrivateSettings, setLoadingPrivateSettings] = useState(false)
  const [editingCoordinacion, setEditingCoordinacion] = useState(false)
  const [draftWhatsapp, setDraftWhatsapp] = useState('')
  const [draftRules, setDraftRules] = useState('')
  const [savingCoordinacion, setSavingCoordinacion] = useState(false)
  const logoFileInputRef = useRef<HTMLInputElement>(null)

  const userTeams = getUserTeams()
  const myCaptainTeams = userTeams.filter((t) => t.captainId === currentUser?.id)
  const TEAM_LIMIT_MAX = 5
  const isTeamLimitReached = userTeams.length >= TEAM_LIMIT_MAX
  const allTeams = currentUser ? getFilteredTeams(currentUser.gender) : []
  const pendingInvites = teamInvites.filter(
    inv => inv.inviteeId === currentUser?.id && inv.status === 'pending'
  )
  const pendingJoinRequestsForMe = teamJoinRequests.filter(
    (r) =>
      r.status === 'pending' &&
      teams.some((t) => t.id === r.teamId && t.captainId === currentUser?.id)
  )

  const pendingJoinForTeam = (teamId: string) =>
    teamJoinRequests.filter(
      (r) => r.teamId === teamId && r.status === 'pending'
    )

  const myPendingJoinForTeam = (teamId: string) =>
    teamJoinRequests.find(
      (r) =>
        r.teamId === teamId &&
        r.requesterId === currentUser?.id &&
        r.status === 'pending'
    )

  const isMemberOfTeam = (team: Team) =>
    team.members.some((m) => m.id === currentUser?.id)
  const incomingRivalChallenges = rivalChallenges.filter((c) => {
    if (c.status !== 'pending') return false
    if (c.mode === 'direct') return c.challengedCaptainId === currentUser?.id
    return c.challengerCaptainId !== currentUser?.id && myCaptainTeams.length > 0
  })

  const detailTeam: Team | null =
    selectedTeam == null
      ? null
      : (teams.find((t) => t.id === selectedTeam.id) ?? selectedTeam)

  useEffect(() => {
    if (!selectedTeam || view !== 'detail') return
    setTeamDetailEditing(false)
  }, [selectedTeam?.id, view])

  useEffect(() => {
    if (!selectedTeam || view !== 'detail' || teamDetailEditing || !detailTeam)
      return
    setDraftTeamName(detailTeam.name)
    setDraftTeamDescription(detailTeam.description ?? '')
  }, [
    selectedTeam?.id,
    view,
    teamDetailEditing,
    detailTeam?.id,
    detailTeam?.name,
    detailTeam?.description,
  ])

  useEffect(() => {
    if (!teamsDetailFocusTeamId || !currentUser) return
    const tid = teamsDetailFocusTeamId
    const t = teams.find((x) => x.id === tid)
    if (t) {
      setSelectedTeam(t)
      setView('detail')
      setTeamsDetailFocusTeamId(null)
      return
    }
    if (teams.length === 0) return
    toast.error('No encontramos ese equipo.')
    setTeamsDetailFocusTeamId(null)
  }, [teamsDetailFocusTeamId, teams, currentUser, setTeamsDetailFocusTeamId])

  useEffect(() => {
    if (view !== 'detail') {
      setEditingCoordinacion(false)
    }
  }, [view])

  useEffect(() => {
    if (
      view !== 'detail' ||
      !detailTeam ||
      !currentUser ||
      !isMemberOfTeam(detailTeam) ||
      !isSupabaseConfigured()
    ) {
      setMemberPrivateSettings(null)
      setLoadingPrivateSettings(false)
      return
    }
    let cancelled = false
    setLoadingPrivateSettings(true)
    ;(async () => {
      const supabase = createClient()
      const s = await fetchTeamPrivateSettings(supabase, detailTeam.id)
      if (!cancelled) {
        setMemberPrivateSettings(s)
        setLoadingPrivateSettings(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [view, detailTeam?.id, currentUser?.id, teams])

  const openCoordinacionEditor = () => {
    setDraftWhatsapp(memberPrivateSettings?.whatsappInviteUrl ?? '')
    setDraftRules(memberPrivateSettings?.rulesText ?? '')
    setEditingCoordinacion(true)
  }

  const handleCreateTeam = async () => {
    if (!currentUser || !teamName.trim()) return
    if (isTeamLimitReached) {
      toast.error(`Llegaste al máximo de ${TEAM_LIMIT_MAX} equipos.`)
      return
    }

    await createTeam({
      name: teamName,
      level: teamLevel,
      captainId: currentUser.id,
      members: [
        {
          id: currentUser.id,
          name: currentUser.name,
          position: currentUser.position,
          photo: currentUser.photo,
          status: 'confirmed',
        },
      ],
      city: currentUser.city,
      cityId: currentUser.cityId,
      gender: currentUser.gender,
      description: teamDescription || undefined,
    })

    setTeamName('')
    setTeamLevel('intermedio')
    setTeamDescription('')
    setView('list')
  }

  const handleCancelTeamEdit = () => {
    if (!detailTeam) return
    setDraftTeamName(detailTeam.name)
    setDraftTeamDescription(detailTeam.description ?? '')
    setTeamDetailEditing(false)
  }

  const handleSaveTeamProfile = async () => {
    if (!detailTeam || detailTeam.captainId !== currentUser?.id) return
    const name = draftTeamName.trim()
    const descTrim = draftTeamDescription.trim()
    const prevDesc = (detailTeam.description ?? '').trim()
    if (name.length < 2) {
      toast.error('El nombre del equipo debe tener al menos 2 caracteres.')
      return
    }
    if (name === detailTeam.name && descTrim === prevDesc) {
      toast.info('Sin cambios')
      return
    }
    setSavingTeam(true)
    try {
      await updateTeam(detailTeam.id, {
        name,
        description: descTrim.length > 0 ? descTrim : null,
      })
      setTeamDetailEditing(false)
    } finally {
      setSavingTeam(false)
    }
  }

  const handleLogoFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !detailTeam || detailTeam.captainId !== currentUser?.id) return
    if (!isSupabaseConfigured()) {
      toast.error('Configura Supabase para subir fotos')
      return
    }
    setSavingTeam(true)
    try {
      const supabase = createClient()
      const result = await uploadTeamLogoFile(supabase, detailTeam.id, file)
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      await updateTeam(detailTeam.id, { logo: result.publicUrl })
      setLogoCacheBust((n) => n + 1)
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Error al subir la imagen'
      )
    } finally {
      setSavingTeam(false)
    }
  }

  const handleRemoveTeamLogo = async () => {
    if (!detailTeam || detailTeam.captainId !== currentUser?.id || !detailTeam.logo)
      return
    setSavingTeam(true)
    try {
      if (isSupabaseConfigured()) {
        const supabase = createClient()
        await deleteTeamLogoFile(supabase, detailTeam.id)
      }
      await updateTeam(detailTeam.id, { logo: null })
      setLogoCacheBust((n) => n + 1)
    } finally {
      setSavingTeam(false)
    }
  }

  const handleDeleteTeam = async () => {
    if (!detailTeam || detailTeam.captainId !== currentUser?.id) return
    const ok = confirm(
      `¿Eliminar el equipo "${detailTeam.name}"? Se borrarán miembros, invitaciones y solicitudes.`
    )
    if (!ok) return
    try {
      if (detailTeam.logo && isSupabaseConfigured()) {
        const supabase = createClient()
        await deleteTeamLogoFile(supabase, detailTeam.id)
      }
    } catch {
      // ignore
    }
    await deleteTeam(detailTeam.id)
    setSelectedTeam(null)
    setView('list')
  }

  const handleLeaveTeam = async () => {
    if (!detailTeam || !currentUser) return
    if (detailTeam.captainId === currentUser.id) return
    const ok = confirm(`¿Quieres retirarte de "${detailTeam.name}"?`)
    if (!ok) return
    await leaveTeam(detailTeam.id)
    setSelectedTeam(null)
    setView('list')
  }

  const getTeamInviteUrl = (team: Team) =>
    typeof window !== 'undefined'
      ? teamInviteAbsoluteUrl(team.id, window.location.origin)
      : ''

  const handleCopyTeamInviteLink = async (team: Team) => {
    const url = getTeamInviteUrl(team)
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      toast.success('Enlace copiado')
    } catch {
      toast.error('No se pudo copiar el enlace')
    }
  }

  const handleShareTeamInviteLink = async (team: Team) => {
    const url = getTeamInviteUrl(team)
    if (!url) return
    try {
      if (navigator.share) {
        await navigator.share({
          title: `Únete a ${team.name}`,
          text: `Te invitan a ${team.name} en SPORTMATCH.`,
          url,
        })
      } else {
        await handleCopyTeamInviteLink(team)
      }
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return
      await handleCopyTeamInviteLink(team)
    }
  }

  const handleWhatsAppTeamInvite = (team: Team) => {
    const url = getTeamInviteUrl(team)
    if (!url) return
    const text = encodeURIComponent(
      `¡Te invito a unirte a ${team.name} en SPORTMATCH! ${url}`
    )
    window.open(`https://wa.me/?text=${text}`, '_blank', 'noopener,noreferrer')
  }

  const availableUsers = currentUser
    ? getFilteredUsers(currentUser.gender).filter((u) =>
        !selectedTeam?.members.some((m) => m.id === u.id) &&
        (searchQuery === '' ||
          u.name.toLowerCase().includes(searchQuery.toLowerCase()))
      )
    : []

  const renderTeamCard = (team: Team, isUserTeam: boolean) => {
    const isCaptain = team.captainId === currentUser?.id
    const isMember = userTeams.some((t) => t.id === team.id)
    const myJoin = myPendingJoinForTeam(team.id)
    const canRequestJoin =
      !isUserTeam &&
      !isMember &&
      team.gender === currentUser?.gender &&
      team.members.length < 6 &&
      !myJoin
    const canChallenge = !isUserTeam && myCaptainTeams.length > 0

    return (
      <Card 
        key={team.id} 
        className="bg-card border-border cursor-pointer hover:border-primary/50 transition-colors"
        onClick={() => {
          setSelectedTeam(team)
          setView('detail')
        }}
      >
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl bg-muted overflow-hidden flex-shrink-0">
              {team.logo ? (
                <img 
                  src={team.logo} 
                  alt={team.name} 
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-primary/20">
                  <Shield className="w-7 h-7 text-primary" />
                </div>
              )}
            </div>
            
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-foreground truncate">{team.name}</h3>
                {isCaptain && (
                  <Crown className="w-4 h-4 text-accent flex-shrink-0" />
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
              {team.description && (
                <p className="text-xs text-muted-foreground mt-1 truncate">
                  {team.description}
                </p>
              )}
            </div>
            
            <ChevronRight className="w-5 h-5 text-muted-foreground flex-shrink-0" />
          </div>
          {!isUserTeam && (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!canRequestJoin}
                onClick={(e) => {
                  e.stopPropagation()
                  if (!canRequestJoin) return
                  void requestToJoinTeam(team.id)
                }}
              >
                <Handshake className="w-4 h-4 mr-1.5" />
                {myJoin ? 'Solicitud pendiente' : 'Solicitar unirme'}
              </Button>
              <Button
                type="button"
                size="sm"
                className="bg-red-500 hover:bg-red-500/90 text-white"
                disabled={!canChallenge}
                onClick={(e) => {
                  e.stopPropagation()
                  if (!canChallenge) {
                    toast.error('Debes ser capitán de un equipo para desafiar.')
                    return
                  }
                  saveRivalTargetTeamId(team.id)
                  setCurrentScreen('create')
                }}
              >
                <Shield className="w-4 h-4 mr-1.5" />
                Desafiar
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    )
  }

  const renderInviteCard = (invite: typeof pendingInvites[0]) => (
    <Card key={invite.id} className="bg-card border-accent/50">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Invitación de</p>
            <p className="font-semibold text-foreground">{invite.inviterName}</p>
            <p className="text-sm text-primary">{invite.teamName}</p>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => void respondToInvite(invite.id, false)}
              className="h-9 w-9 p-0"
            >
              <X className="w-4 h-4" />
            </Button>
            <Button
              size="sm"
              onClick={() => void respondToInvite(invite.id, true)}
              className="h-9 w-9 p-0 bg-primary hover:bg-primary/90"
            >
              <Check className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )

  const renderJoinRequestCard = (r: TeamJoinRequest) => (
    <Card key={r.id} className="bg-card border-primary/40">
      <CardContent className="p-4">
        <div className="flex gap-3 items-start">
          <img
            src={r.requesterPhoto}
            alt=""
            className="w-12 h-12 rounded-full object-cover shrink-0"
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-muted-foreground">Solicitud de ingreso</p>
            <p className="font-semibold text-foreground truncate">{r.teamName}</p>
            <p className="text-sm text-foreground">{r.requesterName}</p>
          </div>
        </div>
        <div className="flex gap-2 mt-3">
          <Button
            size="sm"
            variant="outline"
            className="flex-1"
            onClick={() => void respondToJoinRequest(r.id, false)}
          >
            Rechazar
          </Button>
          <Button
            size="sm"
            className="flex-1 bg-primary hover:bg-primary/90"
            onClick={() => void respondToJoinRequest(r.id, true)}
          >
            Aceptar
          </Button>
        </div>
      </CardContent>
    </Card>
  )

  const renderRivalChallengeCard = (challenge: typeof incomingRivalChallenges[0]) => {
    const selectedAcceptTeamId =
      selectedAcceptTeamByChallenge[challenge.id] ??
      (challenge.mode === 'direct'
        ? challenge.challengedTeamId ?? ''
        : '')
    const canAcceptDirect = challenge.mode === 'direct' && !!challenge.challengedTeamId
    const canAcceptOpen = challenge.mode === 'open' && !!selectedAcceptTeamId
    const canAccept = canAcceptDirect || canAcceptOpen

    return (
      <Card key={challenge.id} className="bg-card border-red-500/30">
        <CardContent className="p-4">
          <div className="space-y-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-red-400">
                {challenge.mode === 'direct' ? 'Desafío directo' : 'Búsqueda abierta'}
              </p>
              <p className="font-semibold text-foreground mt-1">
                {challenge.opportunityTitle}
              </p>
              <p className="text-sm text-muted-foreground mt-0.5">
                {challenge.challengerTeamName}
                {challenge.mode === 'direct' && challenge.challengedTeamName
                  ? ` desafía a ${challenge.challengedTeamName}`
                  : ' busca rival para partido'}
              </p>
            </div>
            {challenge.mode === 'open' && (
              <>
                {myCaptainTeams.length > 0 ? (
                  <div className="space-y-1.5">
                    <p className="text-xs text-muted-foreground">
                      Selecciona con qué equipo quieres aceptar este desafío:
                    </p>
                    <select
                      value={selectedAcceptTeamId}
                      onChange={(e) =>
                        setSelectedAcceptTeamByChallenge((prev) => ({
                          ...prev,
                          [challenge.id]: e.target.value,
                        }))
                      }
                      className="w-full h-10 rounded-lg bg-secondary border border-border px-3 text-sm text-foreground"
                    >
                      <option value="">Selecciona tu equipo</option>
                      {myCaptainTeams.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    No puedes desafiar porque no tienes un equipo como capitán.
                  </p>
                )}
              </>
            )}
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => void respondToRivalChallenge(challenge.id, false)}
                className="flex-1"
              >
                Rechazar
              </Button>
              <Button
                size="sm"
                onClick={() =>
                  void respondToRivalChallenge(
                    challenge.id,
                    true,
                    challenge.mode === 'direct'
                      ? challenge.challengedTeamId
                      : selectedAcceptTeamId
                  )
                }
                disabled={!canAccept}
                className="flex-1 bg-red-500 hover:bg-red-600 text-white"
              >
                Aceptar desafío
              </Button>
            </div>
            {challenge.mode === 'open' && myCaptainTeams.length === 0 && (
              <Button
                size="sm"
                variant="secondary"
                className="w-full"
                onClick={() => setView('create')}
              >
                Crear equipo para desafiar
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    )
  }

  const renderListView = () => (
    <div className="flex-1 overflow-y-auto pb-20">
      <div className="px-4 py-6">
        {/* Pending Invites */}
        {pendingInvites.length > 0 && (
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-foreground mb-3 flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-accent" />
              Invitaciones pendientes
            </h2>
            <div className="space-y-3">
              {pendingInvites.map(renderInviteCard)}
            </div>
          </div>
        )}

        {pendingJoinRequestsForMe.length > 0 && (
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-foreground mb-3 flex items-center gap-2">
              <Handshake className="w-5 h-5 text-primary" />
              Solicitudes de ingreso a tus equipos
            </h2>
            <div className="space-y-3">
              {pendingJoinRequestsForMe.map(renderJoinRequestCard)}
            </div>
          </div>
        )}

        {incomingRivalChallenges.length > 0 && (
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-foreground mb-3 flex items-center gap-2">
              <Shield className="w-5 h-5 text-red-400" />
              Desafíos de rival pendientes
            </h2>
            <div className="space-y-3">
              {incomingRivalChallenges.map(renderRivalChallengeCard)}
            </div>
          </div>
        )}

        {/* My Teams */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-foreground">Mis Equipos</h2>
            <Button
              size="sm"
              onClick={() => setView('create')}
              className="bg-primary hover:bg-primary/90"
              disabled={isTeamLimitReached}
            >
              <Plus className="w-4 h-4 mr-1" />
              Crear
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            Puedes ser parte de hasta <span className="text-foreground font-medium">{TEAM_LIMIT_MAX}</span>{' '}
            equipos en total (incluye los que creas y a los que te unes).
            {isTeamLimitReached ? (
              <span className="text-foreground font-medium">
                {' '}Ya llegaste al límite.
              </span>
            ) : null}
          </p>
          
          {userTeams.length > 0 ? (
            <div className="space-y-3">
              {userTeams.map(team => renderTeamCard(team, true))}
            </div>
          ) : (
            <Card className="bg-card border-border border-dashed">
              <CardContent className="p-6 text-center">
                <Users className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">No tienes equipos aún</p>
                <Button
                  variant="link"
                  onClick={() => setView('create')}
                  className="text-primary mt-2"
                  disabled={isTeamLimitReached}
                >
                  Crear tu primer equipo
                </Button>
              </CardContent>
            </Card>
          )}
        </div>

        {/* All Teams */}
        <div>
          <h2 className="text-lg font-semibold text-foreground mb-3">
            Equipos en {currentUser?.city || 'tu ciudad'}
          </h2>
          <div className="space-y-3">
            {allTeams
              .filter(t => !userTeams.some(ut => ut.id === t.id))
              .map(team => renderTeamCard(team, false))}
          </div>
        </div>
      </div>
    </div>
  )

  const renderCreateView = () => (
    <div className="flex-1 overflow-y-auto pb-20">
      <div className="px-4 py-6">
        <button
          onClick={() => setView('list')}
          className="flex items-center gap-2 text-muted-foreground mb-6"
        >
          <ArrowLeft className="w-5 h-5" />
          Volver
        </button>

        <h2 className="text-2xl font-bold text-foreground mb-6">Crear Equipo</h2>

        {isTeamLimitReached ? (
          <Card className="bg-card border-border">
            <CardContent className="p-4 text-sm text-muted-foreground space-y-1">
              <p className="text-foreground font-medium">
                Límite máximo de equipos
              </p>
              <p>
                Ya eres parte de {userTeams.length}/{TEAM_LIMIT_MAX} equipos. Para crear uno nuevo,
                primero debes salir de alguno.
              </p>
            </CardContent>
          </Card>
        ) : null}

        <div className="space-y-6">
          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">
              Nombre del equipo
            </label>
            <Input
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              placeholder="Ej: Los Cracks FC"
              className="bg-card border-border"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">
              Nivel del equipo
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(levelLabels) as Level[]).map((level) => (
                <button
                  key={level}
                  onClick={() => setTeamLevel(level)}
                  className={`p-3 rounded-xl border text-sm font-medium transition-colors ${
                    teamLevel === level
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-card text-foreground hover:border-primary/50'
                  }`}
                >
                  {levelLabels[level]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">
              Descripción (opcional)
            </label>
            <Input
              value={teamDescription}
              onChange={(e) => setTeamDescription(e.target.value)}
              placeholder="Cuéntanos sobre tu equipo..."
              className="bg-card border-border"
            />
          </div>

          <Button
            onClick={handleCreateTeam}
            disabled={!teamName.trim() || isTeamLimitReached}
            className="w-full bg-primary hover:bg-primary/90 py-6"
          >
            <Shield className="w-5 h-5 mr-2" />
            Crear Equipo
          </Button>
        </div>
      </div>
    </div>
  )

  const renderDetailView = () => {
    if (!detailTeam) return null

    const team = detailTeam
    const isCaptain = team.captainId === currentUser?.id
    const isMember = isMemberOfTeam(team)
    const myJoin = myPendingJoinForTeam(team.id)
    const incomingJoin = pendingJoinForTeam(team.id)
    const slotsAvailable = 6 - team.members.length
    const logoSrc = team.logo
      ? `${team.logo}${team.logo.includes('?') ? '&' : '?'}cb=${logoCacheBust}`
      : null

    return (
      <div className="flex-1 overflow-y-auto pb-20">
        <div className="px-4 py-6">
          <button
            onClick={() => {
              setTeamDetailEditing(false)
              setSelectedTeam(null)
              setView('list')
            }}
            className="flex items-center gap-2 text-muted-foreground mb-6"
          >
            <ArrowLeft className="w-5 h-5" />
            Volver
          </button>

          <div className="flex items-start gap-4 mb-6">
            <div className="relative w-20 h-20 shrink-0 rounded-2xl bg-muted overflow-hidden">
              {logoSrc ? (
                <img
                  src={logoSrc}
                  alt={team.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-primary/20">
                  <Shield className="w-10 h-10 text-primary" />
                </div>
              )}
              {isCaptain && (
                <>
                  <input
                    ref={logoFileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    className="hidden"
                    onChange={(e) => void handleLogoFileChange(e)}
                  />
                  <Button
                    type="button"
                    size="icon"
                    variant="secondary"
                    disabled={savingTeam}
                    className="absolute bottom-0 right-0 h-8 w-8 rounded-full shadow-md border border-border"
                    onClick={() => logoFileInputRef.current?.click()}
                    aria-label="Cambiar escudo del equipo"
                  >
                    {savingTeam ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Camera className="w-4 h-4" />
                    )}
                  </Button>
                </>
              )}
            </div>

            <div className="flex-1 min-w-0 space-y-2">
              {isCaptain ? (
                teamDetailEditing ? (
                  <>
                    <label className="text-xs text-muted-foreground">
                      Nombre del equipo
                    </label>
                    <Input
                      value={draftTeamName}
                      onChange={(e) => setDraftTeamName(e.target.value)}
                      className="bg-card border-border h-10"
                      maxLength={80}
                    />
                    <label className="text-xs text-muted-foreground">
                      Descripción (opcional)
                    </label>
                    <Textarea
                      value={draftTeamDescription}
                      onChange={(e) => setDraftTeamDescription(e.target.value)}
                      className="bg-card border-border min-h-[88px] resize-none"
                      maxLength={500}
                      placeholder="Breve texto sobre el equipo…"
                    />
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button
                        type="button"
                        size="sm"
                        disabled={
                          savingTeam ||
                          draftTeamName.trim().length < 2 ||
                          (draftTeamName.trim() === team.name &&
                            draftTeamDescription.trim() ===
                              (team.description ?? '').trim())
                        }
                        onClick={() => void handleSaveTeamProfile()}
                        className="bg-primary hover:bg-primary/90"
                      >
                        Guardar
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={savingTeam}
                        onClick={handleCancelTeamEdit}
                      >
                        Cancelar
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-start justify-between gap-3">
                      <h2 className="text-2xl font-bold text-foreground">
                        {team.name}
                      </h2>
                      <div className="flex gap-2 shrink-0">
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          className="w-fit"
                          onClick={() => setTeamDetailEditing(true)}
                        >
                          Editar
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          disabled={savingTeam}
                          onClick={() => void handleDeleteTeam()}
                        >
                          <Trash2 className="w-4 h-4 mr-1" />
                          Eliminar
                        </Button>
                      </div>
                    </div>
                  </>
                )
              ) : (
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-2xl font-bold text-foreground">
                    {team.name}
                  </h2>
                  {isMember ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void handleLeaveTeam()}
                    >
                      Salir
                    </Button>
                  ) : null}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{levelLabels[team.level]}</Badge>
                <span className="text-sm text-muted-foreground">{team.city}</span>
                {isCaptain && (
                  <span className="text-xs text-muted-foreground">(Capitán)</span>
                )}
              </div>
              {isCaptain && team.logo && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 text-destructive hover:text-destructive"
                  disabled={savingTeam}
                  onClick={() => void handleRemoveTeamLogo()}
                >
                  <Trash2 className="w-4 h-4 mr-1" />
                  Quitar escudo
                </Button>
              )}
            </div>
          </div>

          {(!isCaptain || !teamDetailEditing) && team.description && (
            <p className="text-muted-foreground mb-6">{team.description}</p>
          )}
          {isCaptain && !teamDetailEditing && !team.description && (
            <p className="text-sm text-muted-foreground mb-6 italic">
              Sin descripción. Pulsa Editar para añadir una.
            </p>
          )}

          {isCaptain && incomingJoin.length > 0 && !teamDetailEditing && (
            <div className="mb-6 rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Handshake className="w-4 h-4 text-primary" />
                Solicitudes de ingreso ({incomingJoin.length})
              </h3>
              {incomingJoin.map((r) => (
                <div
                  key={r.id}
                  className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-lg border border-border bg-background/80 p-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <img
                      src={r.requesterPhoto}
                      alt=""
                      className="w-10 h-10 rounded-full object-cover shrink-0"
                    />
                    <span className="font-medium text-foreground truncate">
                      {r.requesterName}
                    </span>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void respondToJoinRequest(r.id, false)}
                    >
                      Rechazar
                    </Button>
                    <Button
                      size="sm"
                      className="bg-primary hover:bg-primary/90"
                      onClick={() => void respondToJoinRequest(r.id, true)}
                    >
                      Aceptar
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!isCaptain &&
            !isMember &&
            team.gender === currentUser?.gender && (
              <div className="mb-6 rounded-xl border border-border bg-card/50 p-4">
                {slotsAvailable === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Este equipo tiene la plantilla completa.
                  </p>
                ) : myJoin ? (
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm text-foreground">
                      Tu solicitud está pendiente de aprobación del capitán.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void cancelJoinRequest(myJoin.id)}
                    >
                      Cancelar solicitud
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm text-muted-foreground">
                      ¿Quieres formar parte de este equipo?
                    </p>
                    <Button
                      className="bg-primary hover:bg-primary/90 shrink-0"
                      onClick={() => void requestToJoinTeam(team.id)}
                    >
                      <Handshake className="w-4 h-4 mr-2" />
                      Solicitar unirme
                    </Button>
                  </div>
                )}
              </div>
            )}

          {isMember && (
            <div className="mb-6 space-y-4">
              {loadingPrivateSettings ? (
                <div className="flex justify-center py-6">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : editingCoordinacion && isCaptain ? (
                <Card className="border-primary/30 bg-card">
                  <CardContent className="space-y-4 p-4">
                    <h3 className="font-semibold text-foreground">
                      Coordinación del equipo
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Solo los miembros del equipo ven el enlace de WhatsApp y las reglas.
                    </p>
                    <div>
                      <label className="text-xs text-muted-foreground">
                        Enlace de invitación a WhatsApp
                      </label>
                      <Input
                        value={draftWhatsapp}
                        onChange={(e) => setDraftWhatsapp(e.target.value)}
                        placeholder="https://chat.whatsapp.com/..."
                        className="mt-1 border-border bg-secondary"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">
                        Reglas del equipo
                      </label>
                      <Textarea
                        value={draftRules}
                        onChange={(e) => setDraftRules(e.target.value)}
                        placeholder="Puntualidad, cancha, cuotas, fair play…"
                        className="mt-1 min-h-[120px] resize-none border-border bg-secondary"
                        maxLength={4000}
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        disabled={savingCoordinacion}
                        onClick={() => {
                          setDraftWhatsapp(
                            memberPrivateSettings?.whatsappInviteUrl ?? ''
                          )
                          setDraftRules(memberPrivateSettings?.rulesText ?? '')
                          setEditingCoordinacion(false)
                        }}
                      >
                        Cancelar
                      </Button>
                      <Button
                        type="button"
                        className="bg-primary hover:bg-primary/90"
                        disabled={savingCoordinacion}
                        onClick={async () => {
                          setSavingCoordinacion(true)
                          try {
                            const res = await updateTeamPrivateSettings(team.id, {
                              whatsappInviteUrl: draftWhatsapp,
                              rulesText: draftRules,
                            })
                            if (res) setMemberPrivateSettings(res)
                            setEditingCoordinacion(false)
                          } finally {
                            setSavingCoordinacion(false)
                          }
                        }}
                      >
                        {savingCoordinacion ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          'Guardar'
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <>
                  <div className="relative overflow-hidden rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-600/25 via-emerald-950/30 to-background p-5 shadow-lg shadow-emerald-950/30">
                    <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-emerald-500/15 blur-2xl" />
                    <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-start gap-3 min-w-0">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#25D366]/25 text-[#25D366] ring-1 ring-[#25D366]/40">
                          <MessageCircle className="h-7 w-7" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-400">
                            Grupo de WhatsApp
                          </p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            Coordinación y avisos entre jugadores
                          </p>
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
                        {memberPrivateSettings?.whatsappInviteUrl ? (
                          <Button
                            asChild
                            className="bg-[#25D366] font-semibold text-white shadow-md hover:bg-[#20bd5a]"
                          >
                            <a
                              href={memberPrivateSettings.whatsappInviteUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <ExternalLink className="mr-2 h-4 w-4" />
                              Unirse al grupo
                            </a>
                          </Button>
                        ) : (
                          <p className="text-sm italic text-muted-foreground">
                            {isCaptain
                              ? 'Añade el enlace de invitación del grupo.'
                              : 'El capitán aún no ha compartido el enlace.'}
                          </p>
                        )}
                        {isCaptain && (
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            className="w-full sm:w-auto"
                            onClick={openCoordinacionEditor}
                          >
                            Editar enlace y reglas
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>

                  {memberPrivateSettings?.rulesText ? (
                    <Card className="border-border bg-card/90">
                      <CardContent className="p-4">
                        <div className="mb-3 flex items-center gap-2">
                          <ScrollText className="h-5 w-5 text-primary" />
                          <h3 className="font-semibold text-foreground">
                            Reglas del equipo
                          </h3>
                        </div>
                        <div className="max-h-52 overflow-y-auto rounded-lg bg-muted/40 px-3 py-2 text-sm leading-relaxed text-foreground whitespace-pre-wrap">
                          {memberPrivateSettings.rulesText}
                        </div>
                      </CardContent>
                    </Card>
                  ) : null}
                </>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4 mb-6">
            <Card className="bg-card border-border">
              <CardContent className="p-4 text-center">
                <p className="text-3xl font-bold text-primary">{team.members.length}</p>
                <p className="text-sm text-muted-foreground">Jugadores</p>
              </CardContent>
            </Card>
            <Card className="bg-card border-border">
              <CardContent className="p-4 text-center">
                <p className="text-3xl font-bold text-accent">{slotsAvailable}</p>
                <p className="text-sm text-muted-foreground">Cupos</p>
              </CardContent>
            </Card>
          </div>

          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold text-foreground">Plantilla</h3>
              {isCaptain && slotsAvailable > 0 && (
                <Button
                  size="sm"
                  onClick={() => setView('invite')}
                  className="bg-primary hover:bg-primary/90"
                >
                  <UserPlus className="w-4 h-4 mr-1" />
                  Invitar
                </Button>
              )}
            </div>

            <div className="space-y-3">
              {team.members.map((member) => (
                <Card key={member.id} className="bg-card border-border">
                  <CardContent className="p-3">
                    <div className="flex items-center gap-3">
                      <img
                        src={member.photo}
                        alt={member.name}
                        className="w-12 h-12 rounded-full object-cover"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-foreground">{member.name}</p>
                          {team.captainId === member.id && (
                            <Crown className="w-4 h-4 text-accent" />
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {positionLabels[member.position]}
                        </p>
                      </div>
                      <Badge
                        variant={member.status === 'confirmed' ? 'default' : 'secondary'}
                        className={member.status === 'confirmed' ? 'bg-primary' : ''}
                      >
                        {member.status === 'confirmed' ? 'Activo' : 'Pendiente'}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}

              {Array.from({ length: slotsAvailable }).map((_, i) => (
                <Card key={`empty-${i}`} className="bg-card border-border border-dashed">
                  <CardContent className="p-3 space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center shrink-0">
                        <Users className="w-6 h-6 text-muted-foreground" />
                      </div>
                      <p className="text-muted-foreground">Cupo disponible</p>
                    </div>
                    {isCaptain && (
                      <div className="flex flex-wrap gap-2 border-t border-border pt-3">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-8"
                          onClick={() => void handleCopyTeamInviteLink(team)}
                        >
                          <Link2 className="w-3.5 h-3.5 mr-1" />
                          Copiar enlace
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-8"
                          onClick={() => handleWhatsAppTeamInvite(team)}
                        >
                          WhatsApp
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          className="h-8 bg-primary hover:bg-primary/90"
                          onClick={() => void handleShareTeamInviteLink(team)}
                        >
                          <Share2 className="w-3.5 h-3.5 mr-1" />
                          Compartir
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  const renderInviteView = () => {
    if (!selectedTeam) return null

    return (
      <div className="flex-1 overflow-y-auto pb-20">
        <div className="px-4 py-6">
          <button
            onClick={() => setView('detail')}
            className="flex items-center gap-2 text-muted-foreground mb-6"
          >
            <ArrowLeft className="w-5 h-5" />
            Volver
          </button>

          <h2 className="text-2xl font-bold text-foreground mb-2">Invitar Jugadores</h2>
          <p className="text-muted-foreground mb-6">
            Invita jugadores a {selectedTeam.name}
          </p>

          <div className="relative mb-6">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar jugadores..."
              className="pl-10 bg-card border-border"
            />
          </div>

          <div className="space-y-3">
            {availableUsers.map((user) => {
              const alreadyInvited = teamInvites.some(
                inv => inv.teamId === selectedTeam.id && inv.inviteeId === user.id && inv.status === 'pending'
              )

              return (
                <Card key={user.id} className="bg-card border-border">
                  <CardContent className="p-3">
                    <div className="flex items-center gap-3">
                      <img
                        src={user.photo}
                        alt={user.name}
                        className="w-12 h-12 rounded-full object-cover"
                      />
                      <div className="flex-1">
                        <p className="font-medium text-foreground">{user.name}</p>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">
                            {positionLabels[user.position]}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {levelLabels[user.level]}
                          </span>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        disabled={alreadyInvited}
                        onClick={() => void inviteToTeam(selectedTeam.id, user.id)}
                        className={alreadyInvited ? 'bg-muted text-muted-foreground' : 'bg-primary hover:bg-primary/90'}
                      >
                        {alreadyInvited ? 'Invitado' : 'Invitar'}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )
            })}

            {availableUsers.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                No hay jugadores disponibles para invitar
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur-lg">
        <div className="px-4 py-4">
          <AppScreenBrandHeading title="Equipos" titleClassName="text-xl" />
        </div>
      </header>

      {view === 'list' && renderListView()}
      {view === 'create' && renderCreateView()}
      {view === 'detail' && renderDetailView()}
      {view === 'invite' && renderInviteView()}

      <BottomNav />
    </div>
  )
}
