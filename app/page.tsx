'use client'

import { useApp } from '@/lib/app-context'
import { LandingPage } from '@/components/landing-page'
import { AuthScreen } from '@/components/auth-screen'
import { OnboardingScreen } from '@/components/onboarding-screen'
import { HomeScreen } from '@/components/home-screen'
import { CreateScreen } from '@/components/create-screen'
import { ExploreScreen } from '@/components/explore-screen'
import { MatchesScreen } from '@/components/matches-screen'
import { ChatScreen } from '@/components/chat-screen'
import { MatchDetailsScreen } from '@/components/match-details-screen'
import { ProfileScreen } from '@/components/profile-screen'
import { TeamsScreen } from '@/components/teams-screen'
import { VenueDashboardScreen } from '@/components/venue-dashboard-screen'
import { VenueOnboardingScreen } from '@/components/venue-onboarding-screen'
import { AdminDashboardScreen } from '@/components/admin-dashboard-screen'
import { PublicPlayerProfileSheet } from '@/components/public-player-profile-sheet'

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
      return (
        <>
          <LandingPage />
          <PublicPlayerProfileSheet />
        </>
      )
    case 'auth':
      return (
        <>
          <AuthScreen />
          <PublicPlayerProfileSheet />
        </>
      )
    case 'onboarding':
      return (
        <>
          <OnboardingScreen />
          <PublicPlayerProfileSheet />
        </>
      )
    case 'home':
      return (
        <>
          <HomeScreen />
          <PublicPlayerProfileSheet />
        </>
      )
    case 'create':
      return (
        <>
          <CreateScreen />
          <PublicPlayerProfileSheet />
        </>
      )
    case 'explore':
      return (
        <>
          <ExploreScreen />
          <PublicPlayerProfileSheet />
        </>
      )
    case 'matches':
      return (
        <>
          <MatchesScreen />
          <PublicPlayerProfileSheet />
        </>
      )
    case 'chat':
      return (
        <>
          <ChatScreen />
          <PublicPlayerProfileSheet />
        </>
      )
    case 'matchDetails':
      return (
        <>
          <MatchDetailsScreen />
          <PublicPlayerProfileSheet />
        </>
      )
    case 'profile':
      return (
        <>
          <ProfileScreen />
          <PublicPlayerProfileSheet />
        </>
      )
    case 'teams':
      return (
        <>
          <TeamsScreen />
          <PublicPlayerProfileSheet />
        </>
      )
    case 'venueOnboarding':
      return (
        <>
          <VenueOnboardingScreen />
          <PublicPlayerProfileSheet />
        </>
      )
    case 'venueDashboard':
      return (
        <>
          <VenueDashboardScreen />
          <PublicPlayerProfileSheet />
        </>
      )
    case 'adminDashboard':
      return (
        <>
          <AdminDashboardScreen />
          <PublicPlayerProfileSheet />
        </>
      )
    default:
      return (
        <>
          <LandingPage />
          <PublicPlayerProfileSheet />
        </>
      )
  }
}

export default function Page() {
  return <AppContent />
}
