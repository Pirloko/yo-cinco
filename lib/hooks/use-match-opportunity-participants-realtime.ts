'use client'

import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { getBrowserSupabase, isSupabaseConfigured } from '@/lib/supabase/client'
import {
  applyMatchOpportunityParticipantsRealtime,
  replaceParticipantsCacheFromServer,
  type ParticipantsRealtimePayload,
} from '@/lib/realtime/match-opportunity-participants-realtime'
import { queryKeys } from '@/lib/query-keys'

/**
 * Sincroniza la query `matchOpportunity.participants` con Realtime (Fase 5).
 * No usa invalidateQueries: fusiona en caché o un solo fetch de reemplazo.
 */
export function useMatchOpportunityParticipantsRealtime(
  opportunityId: string | null | undefined,
  creatorId: string | null | undefined,
  enabled: boolean
) {
  const queryClient = useQueryClient()
  const creatorRef = useRef(creatorId)
  creatorRef.current = creatorId

  useEffect(() => {
    if (!enabled || !opportunityId || !isSupabaseConfigured()) return
    const supabase = getBrowserSupabase()
    if (!supabase) return
    const oppId = opportunityId
    let timer: ReturnType<typeof setTimeout> | null = null
    const pending: ParticipantsRealtimePayload[] = []

    const flush = () => {
      if (pending.length === 0) return
      const batch = pending.splice(0, pending.length)
      void (async () => {
        const merged = await applyMatchOpportunityParticipantsRealtime(
          supabase,
          queryClient,
          oppId,
          creatorRef.current ?? null,
          batch
        )
        if (merged === 'refetch') {
          await replaceParticipantsCacheFromServer(supabase, queryClient, oppId)
        }
        void queryClient.invalidateQueries({
          queryKey: queryKeys.matchOpportunity.participantLeaveReasons(oppId),
        })
      })()
    }

    const enqueue = (
      eventType: 'INSERT' | 'UPDATE' | 'DELETE',
      rowNew: Record<string, unknown> | null,
      rowOld: Record<string, unknown> | null
    ) => {
      pending.push({ eventType, new: rowNew, old: rowOld })
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        timer = null
        flush()
      }, 250)
    }

    const channel = supabase
      .channel(`match-opportunity-participants:${oppId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'match_opportunity_participants',
          filter: `opportunity_id=eq.${oppId}`,
        },
        (payload) =>
          enqueue('INSERT', payload.new as Record<string, unknown> | null, null)
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'match_opportunity_participants',
          filter: `opportunity_id=eq.${oppId}`,
        },
        (payload) =>
          enqueue(
            'UPDATE',
            payload.new as Record<string, unknown> | null,
            payload.old as Record<string, unknown> | null
          )
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'match_opportunity_participants',
          filter: `opportunity_id=eq.${oppId}`,
        },
        (payload) =>
          enqueue('DELETE', null, payload.old as Record<string, unknown> | null)
      )
      .subscribe()

    return () => {
      if (timer) clearTimeout(timer)
      pending.length = 0
      void supabase.removeChannel(channel)
    }
  }, [enabled, opportunityId, queryClient])
}
