'use client'

import { useCallback } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getBrowserSupabase } from '@/lib/supabase/client'
import type { InAppNotification } from '@/lib/notifications/types'

type NotificationsApiResponse = {
  items: InAppNotification[]
  unreadCount: number
}

const queryKey = ['in-app-notifications'] as const

async function authHeaders() {
  const sb = getBrowserSupabase()
  if (!sb) return null
  const {
    data: { session },
  } = await sb.auth.getSession()
  if (!session?.access_token) return null
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${session.access_token}`,
  }
}

export function useInAppNotifications() {
  const qc = useQueryClient()

  const query = useQuery({
    queryKey,
    queryFn: async (): Promise<NotificationsApiResponse> => {
      const headers = await authHeaders()
      if (!headers) return { items: [], unreadCount: 0 }
      const res = await fetch('/api/notifications?limit=10', {
        method: 'GET',
        headers,
        credentials: 'include',
      })
      if (!res.ok) throw new Error(`Error ${res.status}`)
      const json = (await res.json()) as NotificationsApiResponse
      return {
        items: Array.isArray(json.items) ? json.items : [],
        unreadCount:
          typeof json.unreadCount === 'number' ? json.unreadCount : 0,
      }
    },
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  })

  const markReadMutation = useMutation({
    mutationFn: async (notificationId: string) => {
      const headers = await authHeaders()
      if (!headers) return
      await fetch('/api/notifications/read', {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({ notificationId }),
      })
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [...queryKey] })
    },
  })

  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      const headers = await authHeaders()
      if (!headers) return
      await fetch('/api/notifications/read-all', {
        method: 'POST',
        headers,
        credentials: 'include',
      })
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [...queryKey] })
    },
  })

  const markAsRead = useCallback(
    async (notificationId: string) => {
      await markReadMutation.mutateAsync(notificationId)
    },
    [markReadMutation]
  )

  const markAllAsRead = useCallback(async () => {
    await markAllReadMutation.mutateAsync()
  }, [markAllReadMutation])

  return {
    items: query.data?.items ?? [],
    unreadCount: query.data?.unreadCount ?? 0,
    isLoading: query.isLoading,
    isRefreshing: query.isFetching,
    markAsRead,
    markAllAsRead,
    refetch: query.refetch,
  }
}
