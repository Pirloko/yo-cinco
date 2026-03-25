'use client'

import { useState, useRef } from 'react'
import { useApp } from '@/lib/app-context'
import { BottomNav } from '@/components/bottom-nav'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { User } from '@/lib/types'
import { ArrowLeft, X, Heart, Star, MapPin, Calendar, RotateCcw } from 'lucide-react'

export function SwipeScreen() {
  const { currentUser, getFilteredUsers, setCurrentScreen } = useApp()
  const [currentIndex, setCurrentIndex] = useState(0)
  const [swipedUsers, setSwipedUsers] = useState<{ id: string; liked: boolean }[]>([])
  const [dragOffset, setDragOffset] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)
  const startX = useRef(0)

  const users = currentUser ? getFilteredUsers(currentUser.gender) : []
  const currentProfile = users[currentIndex]
  const isFinished = currentIndex >= users.length

  const handleSwipe = (liked: boolean) => {
    if (!currentProfile) return

    setSwipedUsers([...swipedUsers, { id: currentProfile.id, liked }])
    setDragOffset(liked ? 500 : -500)
    
    setTimeout(() => {
      setCurrentIndex(currentIndex + 1)
      setDragOffset(0)
    }, 300)
  }

  const handleUndo = () => {
    if (swipedUsers.length === 0) return
    setSwipedUsers(swipedUsers.slice(0, -1))
    setCurrentIndex(currentIndex - 1)
  }

  const handleDragStart = (clientX: number) => {
    setIsDragging(true)
    startX.current = clientX
  }

  const handleDragMove = (clientX: number) => {
    if (!isDragging) return
    const diff = clientX - startX.current
    setDragOffset(diff)
  }

  const handleDragEnd = () => {
    if (!isDragging) return
    setIsDragging(false)
    
    if (Math.abs(dragOffset) > 100) {
      handleSwipe(dragOffset > 0)
    } else {
      setDragOffset(0)
    }
  }

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'principiante':
        return 'bg-blue-500/20 text-blue-400 border-blue-500/30'
      case 'intermedio':
        return 'bg-primary/20 text-primary border-primary/30'
      case 'avanzado':
        return 'bg-accent/20 text-accent border-accent/30'
      case 'competitivo':
        return 'bg-red-500/20 text-red-400 border-red-500/30'
      default:
        return ''
    }
  }

  const getPositionLabel = (position: string) => {
    switch (position) {
      case 'portero':
        return 'Portero'
      case 'defensa':
        return 'Defensa'
      case 'mediocampista':
        return 'Mediocampista'
      case 'delantero':
        return 'Delantero'
      default:
        return position
    }
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <header className="flex items-center gap-4 p-4 border-b border-border">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCurrentScreen('home')}
          className="text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-lg font-semibold text-foreground">Descubre jugadores</h1>
          <p className="text-sm text-muted-foreground">Desliza para conectar</p>
        </div>
        {swipedUsers.length > 0 && (
          <Button
            variant="ghost"
            size="icon"
            onClick={handleUndo}
            className="text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="w-5 h-5" />
          </Button>
        )}
      </header>

      {/* Card Stack */}
      <div className="flex-1 flex items-center justify-center p-4 min-h-[calc(100vh-180px)]">
        {isFinished ? (
          <div className="text-center space-y-4">
            <div className="w-20 h-20 rounded-full bg-secondary flex items-center justify-center mx-auto">
              <Heart className="w-10 h-10 text-muted-foreground" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-foreground">No hay mas jugadores</h2>
              <p className="text-muted-foreground mt-1">Vuelve mas tarde para ver nuevos perfiles</p>
            </div>
            <Button
              onClick={() => {
                setCurrentIndex(0)
                setSwipedUsers([])
              }}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              Empezar de nuevo
            </Button>
          </div>
        ) : (
          <div className="relative w-full max-w-sm">
            {/* Next Card Preview */}
            {users[currentIndex + 1] && (
              <div className="absolute inset-0 scale-95 opacity-50">
                <PlayerCard user={users[currentIndex + 1]} getLevelColor={getLevelColor} getPositionLabel={getPositionLabel} />
              </div>
            )}

            {/* Current Card */}
            {currentProfile && (
              <div
                ref={cardRef}
                className="relative cursor-grab active:cursor-grabbing transition-transform"
                style={{
                  transform: `translateX(${dragOffset}px) rotate(${dragOffset * 0.05}deg)`,
                  transition: isDragging ? 'none' : 'transform 0.3s ease-out',
                }}
                onMouseDown={(e) => handleDragStart(e.clientX)}
                onMouseMove={(e) => handleDragMove(e.clientX)}
                onMouseUp={handleDragEnd}
                onMouseLeave={handleDragEnd}
                onTouchStart={(e) => handleDragStart(e.touches[0].clientX)}
                onTouchMove={(e) => handleDragMove(e.touches[0].clientX)}
                onTouchEnd={handleDragEnd}
              >
                <PlayerCard user={currentProfile} getLevelColor={getLevelColor} getPositionLabel={getPositionLabel} />

                {/* Swipe Indicators */}
                {dragOffset > 50 && (
                  <div className="absolute top-8 left-8 px-4 py-2 bg-primary rounded-lg border-2 border-primary transform -rotate-12">
                    <span className="text-primary-foreground font-bold text-xl">LIKE</span>
                  </div>
                )}
                {dragOffset < -50 && (
                  <div className="absolute top-8 right-8 px-4 py-2 bg-red-500 rounded-lg border-2 border-red-500 transform rotate-12">
                    <span className="text-white font-bold text-xl">NOPE</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Action Buttons */}
      {!isFinished && (
        <div className="fixed bottom-24 left-0 right-0 flex items-center justify-center gap-6 px-4">
          <button
            onClick={() => handleSwipe(false)}
            className="w-16 h-16 rounded-full bg-red-500/20 border-2 border-red-500/50 flex items-center justify-center hover:scale-110 transition-transform"
          >
            <X className="w-8 h-8 text-red-500" />
          </button>
          <button
            onClick={() => handleSwipe(true)}
            className="w-16 h-16 rounded-full bg-primary/20 border-2 border-primary/50 flex items-center justify-center hover:scale-110 transition-transform"
          >
            <Heart className="w-8 h-8 text-primary" />
          </button>
        </div>
      )}

      <BottomNav />
    </div>
  )
}

function PlayerCard({
  user,
  getLevelColor,
  getPositionLabel,
}: {
  user: User
  getLevelColor: (level: string) => string
  getPositionLabel: (position: string) => string
}) {
  return (
    <div className="bg-card rounded-3xl border border-border overflow-hidden shadow-xl">
      {/* Photo */}
      <div className="relative aspect-[3/4] overflow-hidden">
        <img
          src={user.photo}
          alt={user.name}
          className="w-full h-full object-cover"
          draggable={false}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
        
        {/* Info Overlay */}
        <div className="absolute bottom-0 left-0 right-0 p-6 space-y-3">
          <div className="flex items-end justify-between">
            <div>
              <h2 className="text-2xl font-bold text-white">{user.name}, {user.age}</h2>
              <p className="text-white/80 flex items-center gap-1">
                <MapPin className="w-4 h-4" />
                {user.city}
              </p>
            </div>
            <Badge variant="outline" className={getLevelColor(user.level)}>
              {user.level}
            </Badge>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="secondary" className="bg-white/20 text-white border-white/30">
              {getPositionLabel(user.position)}
            </Badge>
            <Badge variant="secondary" className="bg-white/20 text-white border-white/30 flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {user.availability.length} dias
            </Badge>
          </div>

          {user.bio && (
            <p className="text-white/90 text-sm">{user.bio}</p>
          )}
        </div>
      </div>
    </div>
  )
}
