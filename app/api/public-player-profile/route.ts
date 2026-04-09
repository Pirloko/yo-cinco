import { NextResponse } from 'next/server'
import { fetchPublicPlayerProfileServer } from '@/lib/supabase/public-player-server'
import { CACHE_REVALIDATE_SECONDS } from '@/lib/cache-policy'
import { isValidTeamInviteId } from '@/lib/team-invite-url'

export const revalidate = CACHE_REVALIDATE_SECONDS.publicDynamic

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const userId = (searchParams.get('userId') ?? '').trim()
  if (!userId || !isValidTeamInviteId(userId)) {
    return NextResponse.json({ error: 'invalid_user_id' }, { status: 400 })
  }
  const profile = await fetchPublicPlayerProfileServer(userId)
  return NextResponse.json(
    { profile },
    {
      status: 200,
      headers: {
        'Cache-Control': `public, s-maxage=${CACHE_REVALIDATE_SECONDS.publicDynamic}, stale-while-revalidate=${CACHE_REVALIDATE_SECONDS.publicDynamic}`,
      },
    }
  )
}
