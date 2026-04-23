import type { MatchesHubTab } from '@/lib/types'

export type NotificationType =
  | 'chat_message'
  | 'match_invitation'
  | 'match_upcoming_2h'
  | 'match_finished_review_pending'

export type NotificationPayload = {
  targetTab?: MatchesHubTab
  matchId?: string
  chatId?: string
}

export type InAppNotification = {
  id: string
  type: NotificationType
  title: string
  body: string
  payload: NotificationPayload
  isRead: boolean
  createdAt: string
}
