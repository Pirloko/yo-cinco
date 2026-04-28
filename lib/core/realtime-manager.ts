import {
  useEffect,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react'
import type { User, Team, TeamInvite, TeamJoinRequest, MatchOpportunity, RivalChallenge } from '@/lib/types'
import { getBrowserSupabase, isSupabaseConfigured } from '@/lib/supabase/client'
import { loadPlayerMatchBundle } from '@/lib/services/match.service'
import { loadPlayerTeamBundle } from '@/lib/services/team.service'
import { loadOtherPlayersForUser } from '@/lib/services/user.service'

type Params = {
  currentUser: User | null
  currentUserRef: MutableRefObject<User | null>
  /** Invalidar recargas en vuelo tras join / otra escritura autoritativa (evita pisar `participatingOpportunityIds`). */
  backgroundMatchBundleTokenRef: MutableRefObject<number>
  setMatchOpportunities: Dispatch<SetStateAction<MatchOpportunity[]>>
  setParticipatingOpportunityIds: Dispatch<SetStateAction<string[]>>
  setRivalChallenges: Dispatch<SetStateAction<RivalChallenge[]>>
  setTeams: Dispatch<SetStateAction<Team[]>>
  setTeamInvites: Dispatch<SetStateAction<TeamInvite[]>>
  setTeamJoinRequests: Dispatch<SetStateAction<TeamJoinRequest[]>>
  setUsers: Dispatch<SetStateAction<User[]>>
  setProfilePhotoEpochByUser: Dispatch<SetStateAction<Record<string, number>>>
  setProfilesRealtimeGeneration: Dispatch<SetStateAction<number>>
  setCurrentUser: Dispatch<SetStateAction<User | null>>
}

function hasMeaningfulProfileDelta(
  prev: Record<string, unknown> | null,
  next: Record<string, unknown> | null
): boolean {
  if (!prev || !next) return true
  const watchedKeys = [
    'name',
    'photo_url',
    'gender',
    'position',
    'level',
    'city',
    'city_id',
    'bio',
    'availability',
    'mod_banned_at',
    'mod_ban_reason',
    'mod_yellow_cards',
    'mod_red_cards',
    'mod_last_yellow_at',
    'mod_last_red_at',
    'mod_suspended_until',
  ] as const
  return watchedKeys.some((k) => {
    const a = prev[k]
    const b = next[k]
    if (Array.isArray(a) || Array.isArray(b)) {
      return JSON.stringify(a ?? null) !== JSON.stringify(b ?? null)
    }
    return a !== b
  })
}

export function usePlayerRealtimeManager({
  currentUser,
  currentUserRef,
  backgroundMatchBundleTokenRef,
  setMatchOpportunities,
  setParticipatingOpportunityIds,
  setRivalChallenges,
  setTeams,
  setTeamInvites,
  setTeamJoinRequests,
  setUsers,
  setProfilePhotoEpochByUser,
  setProfilesRealtimeGeneration,
  setCurrentUser,
}: Params) {
  useEffect(() => {
    if (!currentUser || !isSupabaseConfigured()) return
    if (currentUser.accountType !== 'player') return

    const supabase = getBrowserSupabase()
    if (!supabase) return

    const flushState = {
      debounceTimer: null as number | null,
      maxWaitTimer: null as number | null,
      match: false,
      team: false,
      users: false,
    }
    const DEBOUNCE_MS = 250
    const MAX_WAIT_MS = 2000

    const runIncrementalFlush = async () => {
      const u = currentUserRef.current
      if (!u || u.accountType !== 'player' || !isSupabaseConfigured()) return

      const needMatch = flushState.match
      const needTeam = flushState.team
      const needUsers = flushState.users
      flushState.match = false
      flushState.team = false
      flushState.users = false

      if (!needMatch && !needTeam && !needUsers) return

      try {
        const tasks: Promise<void>[] = []
        if (needMatch) {
          tasks.push(
            (async () => {
              const tokenAtStart = ++backgroundMatchBundleTokenRef.current
              const bundle = await loadPlayerMatchBundle(supabase, u.id)
              if (tokenAtStart !== backgroundMatchBundleTokenRef.current) return
              setMatchOpportunities(bundle.matchOpportunities)
              setParticipatingOpportunityIds(bundle.participatingOpportunityIds)
              setRivalChallenges(bundle.rivalChallenges)
            })()
          )
        }
        if (needTeam) {
          tasks.push(
            (async () => {
              const bundle = await loadPlayerTeamBundle(supabase, u.id)
              setTeams(bundle.teams)
              setTeamInvites(bundle.teamInvites)
              setTeamJoinRequests(bundle.teamJoinRequests)
            })()
          )
        }
        if (needUsers) {
          tasks.push(
            (async () => {
              const others = await loadOtherPlayersForUser(supabase, u.id, u.gender)
              setUsers(others)
            })()
          )
        }
        await Promise.all(tasks)
      } catch {
        // red / offline
      }
    }

    const scheduleFlush = (kind: 'match' | 'team' | 'users') => {
      flushState[kind] = true
      if (flushState.maxWaitTimer == null) {
        flushState.maxWaitTimer = window.setTimeout(() => {
          flushState.maxWaitTimer = null
          if (flushState.debounceTimer != null) {
            window.clearTimeout(flushState.debounceTimer)
            flushState.debounceTimer = null
          }
          void runIncrementalFlush()
        }, MAX_WAIT_MS)
      }
      if (flushState.debounceTimer != null) {
        window.clearTimeout(flushState.debounceTimer)
      }
      flushState.debounceTimer = window.setTimeout(() => {
        flushState.debounceTimer = null
        if (flushState.maxWaitTimer != null) {
          window.clearTimeout(flushState.maxWaitTimer)
          flushState.maxWaitTimer = null
        }
        void runIncrementalFlush()
      }, DEBOUNCE_MS)
    }

    const uid = currentUser.id
    const channelMatch = supabase.channel(`app-rt:${uid}:match`)
    const channelTeam = supabase.channel(`app-rt:${uid}:team`)
    const channelUsers = supabase.channel(`app-rt:${uid}:users`)

    const rowEvents = ['INSERT', 'UPDATE', 'DELETE'] as const
    for (const event of rowEvents) {
      // Solo usamos el evento como señal para volver a cargar el bundle (REST).
      // No aplicamos `payload` al estado: join_code u otros campos sensibles no se
      // propagan desde WAL; el bundle usa match_opportunities_masked en fetch.
      channelMatch.on(
        'postgres_changes',
        { event, schema: 'public', table: 'match_opportunities' },
        () => scheduleFlush('match')
      )
      channelMatch.on(
        'postgres_changes',
        { event, schema: 'public', table: 'match_opportunity_participants' },
        () => scheduleFlush('match')
      )
      channelMatch.on(
        'postgres_changes',
        { event, schema: 'public', table: 'rival_challenges' },
        () => scheduleFlush('match')
      )
      channelTeam.on(
        'postgres_changes',
        { event, schema: 'public', table: 'team_invites' },
        () => scheduleFlush('team')
      )
      channelTeam.on(
        'postgres_changes',
        { event, schema: 'public', table: 'team_join_requests' },
        () => scheduleFlush('team')
      )
      channelTeam.on(
        'postgres_changes',
        { event, schema: 'public', table: 'team_members' },
        () => scheduleFlush('team')
      )
      channelTeam.on(
        'postgres_changes',
        { event, schema: 'public', table: 'teams' },
        () => scheduleFlush('team')
      )
      channelTeam.on(
        'postgres_changes',
        { event, schema: 'public', table: 'team_private_settings' },
        () => scheduleFlush('team')
      )
    }

    for (const event of ['INSERT', 'DELETE'] as const) {
      channelUsers.on(
        'postgres_changes',
        { event, schema: 'public', table: 'profiles' },
        () => scheduleFlush('users')
      )
    }

    channelUsers.on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'profiles' },
      (payload) => {
        const oldRow = payload.old as Record<string, unknown> | null
        const row = payload.new as Record<string, unknown> | null
        const changed = hasMeaningfulProfileDelta(oldRow, row)
        if (changed) {
          scheduleFlush('users')
        }
        const id = typeof row?.id === 'string' ? row.id : null
        if (id && changed) {
          setProfilePhotoEpochByUser((prev) => ({
            ...prev,
            [id]: (prev[id] ?? 0) + 1,
          }))
          setProfilesRealtimeGeneration((g) => g + 1)
        }
        setCurrentUser((u) => {
          if (!u || !id || u.id !== id || !row) return u
          const photo = row.photo_url
          const name = row.name
          const nextUser: typeof u = {
            ...u,
            photo: typeof photo === 'string' && photo.trim() ? photo : u.photo,
            name: typeof name === 'string' && name.trim() ? name : u.name,
          }
          if ('mod_banned_at' in row) {
            const v = row.mod_banned_at
            nextUser.modBannedAt =
              v != null && String(v).trim() !== '' ? new Date(String(v)) : undefined
          }
          if ('mod_ban_reason' in row && typeof row.mod_ban_reason === 'string') {
            nextUser.modBanReason = row.mod_ban_reason
          }
          if ('mod_yellow_cards' in row && typeof row.mod_yellow_cards === 'number') {
            nextUser.modYellowCards = row.mod_yellow_cards
          }
          if ('mod_red_cards' in row && typeof row.mod_red_cards === 'number') {
            nextUser.modRedCards = row.mod_red_cards
          }
          if ('mod_last_yellow_at' in row) {
            const v = row.mod_last_yellow_at
            nextUser.modLastYellowAt =
              v != null && String(v).trim() !== '' ? new Date(String(v)) : null
          }
          if ('mod_last_red_at' in row) {
            const v = row.mod_last_red_at
            nextUser.modLastRedAt =
              v != null && String(v).trim() !== '' ? new Date(String(v)) : null
          }
          const unchanged =
            nextUser.photo === u.photo &&
            nextUser.name === u.name &&
            nextUser.modBannedAt?.getTime?.() === u.modBannedAt?.getTime?.() &&
            nextUser.modBanReason === u.modBanReason &&
            nextUser.modYellowCards === u.modYellowCards &&
            nextUser.modRedCards === u.modRedCards &&
            nextUser.modLastYellowAt?.getTime?.() === u.modLastYellowAt?.getTime?.() &&
            nextUser.modLastRedAt?.getTime?.() === u.modLastRedAt?.getTime?.()
          return unchanged ? u : nextUser
        })
      }
    )

    channelMatch.subscribe()
    channelTeam.subscribe()
    channelUsers.subscribe()

    return () => {
      if (flushState.debounceTimer != null) {
        window.clearTimeout(flushState.debounceTimer)
      }
      if (flushState.maxWaitTimer != null) {
        window.clearTimeout(flushState.maxWaitTimer)
      }
      flushState.match = false
      flushState.team = false
      flushState.users = false
      void supabase.removeChannel(channelMatch)
      void supabase.removeChannel(channelTeam)
      void supabase.removeChannel(channelUsers)
    }
  }, [currentUser?.id, currentUser?.accountType])
}
