'use client'

import { AppProvider, useApp } from '@/lib/app-context'
import { LandingPage } from '@/components/landing-page'
import { AuthScreen } from '@/components/auth-screen'
import { OnboardingScreen } from '@/components/onboarding-screen'
import { HomeScreen } from '@/components/home-screen'
import { CreateScreen } from '@/components/create-screen'
import { ExploreScreen } from '@/components/explore-screen'
import { SwipeScreen } from '@/components/swipe-screen'
import { MatchesScreen } from '@/components/matches-screen'
import { ChatScreen } from '@/components/chat-screen'
import { MatchDetailsScreen } from '@/components/match-details-screen'
import { ProfileScreen } from '@/components/profile-screen'
import { TeamsScreen } from '@/components/teams-screen'

function AppContent() {
  const { authLoading, currentScreen } = useApp()

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div
          className="h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent"
          aria-label="Cargando"
        />
      </div>
    )
  }

  switch (currentScreen) {
    case 'landing':
      return <LandingPage />
    case 'auth':
      return <AuthScreen />
    case 'onboarding':
      return <OnboardingScreen />
    case 'home':
      return <HomeScreen />
    case 'create':
      return <CreateScreen />
    case 'explore':
      return <ExploreScreen />
    case 'swipe':
      return <SwipeScreen />
    case 'matches':
      return <MatchesScreen />
    case 'chat':
      return <ChatScreen />
    case 'matchDetails':
      return <MatchDetailsScreen />
    case 'profile':
      return <ProfileScreen />
    case 'teams':
      return <TeamsScreen />
    default:
      return <LandingPage />
  }
}

export default function Page() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  )
}
