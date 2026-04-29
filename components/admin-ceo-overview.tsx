'use client'

import type { ReactNode } from 'react'
import type { AdminCeoBusinessSnapshot } from '@/lib/admin/ceo-snapshot'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import {
  AlertTriangle,
  ArrowDownRight,
  CircleDollarSign,
  LayoutDashboard,
  Magnet,
  Sparkles,
  Target,
  Users,
  Zap,
} from 'lucide-react'

function fmtPct(n: number) {
  return `${n.toLocaleString('es-CL', { maximumFractionDigits: 2 })}%`
}

function fmtInt(n: number) {
  return n.toLocaleString('es-CL', { maximumFractionDigits: 0 })
}

function fmtClp(n: number) {
  return `$${n.toLocaleString('es-CL', { maximumFractionDigits: 0 })}`
}

function fmtHours(n: number | null) {
  if (n === null || Number.isNaN(n)) return '—'
  return `${n.toLocaleString('es-CL', { maximumFractionDigits: 1 })} h`
}

function Section({
  sectionId,
  categoryTag,
  title,
  subtitleQuestion,
  description,
  icon,
  iconClassName,
  children,
  tone,
}: {
  sectionId: string
  categoryTag: string
  title: string
  subtitleQuestion: string
  description: string
  icon: ReactNode
  iconClassName: string
  children: ReactNode
  tone: 'emerald' | 'sky' | 'violet' | 'amber' | 'rose' | 'slate'
}) {
  const border =
    tone === 'emerald'
      ? 'border-emerald-500/25 bg-gradient-to-br from-emerald-500/[0.07] to-transparent'
      : tone === 'sky'
        ? 'border-sky-500/25 bg-gradient-to-br from-sky-500/[0.07] to-transparent'
        : tone === 'violet'
          ? 'border-violet-500/25 bg-gradient-to-br from-violet-500/[0.07] to-transparent'
          : tone === 'amber'
            ? 'border-amber-500/25 bg-gradient-to-br from-amber-500/[0.07] to-transparent'
            : tone === 'rose'
              ? 'border-rose-500/25 bg-gradient-to-br from-rose-500/[0.07] to-transparent'
              : 'border-border bg-gradient-to-br from-muted/40 to-transparent'

  const iconWrap =
    tone === 'emerald'
      ? 'border-emerald-500/30 bg-emerald-500/10'
      : tone === 'sky'
        ? 'border-sky-500/30 bg-sky-500/10'
        : tone === 'violet'
          ? 'border-violet-500/30 bg-violet-500/10'
          : tone === 'amber'
            ? 'border-amber-500/30 bg-amber-500/10'
            : tone === 'rose'
              ? 'border-rose-500/30 bg-rose-500/10'
              : 'border-border bg-muted/50'

  return (
    <section
      className={cn('rounded-2xl border p-4 shadow-sm sm:p-6', border)}
      aria-labelledby={`admin-ceo-${sectionId}`}
    >
      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-1 gap-3 sm:gap-4">
          <span
            className={cn(
              'flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border',
              iconWrap
            )}
          >
            <span className={iconClassName}>{icon}</span>
          </span>
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="text-[10px] font-medium uppercase tracking-wide">
                {categoryTag}
              </Badge>
            </div>
            <h3
              id={`admin-ceo-${sectionId}`}
              className="text-base font-bold leading-tight text-foreground sm:text-lg"
            >
              {title}
            </h3>
            <p className="text-sm font-medium text-primary/90 dark:text-primary">
              {subtitleQuestion}
            </p>
            <p className="max-w-3xl text-xs leading-relaxed text-muted-foreground sm:text-sm">
              {description}
            </p>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">{children}</div>
    </section>
  )
}

function Kpi({
  label,
  value,
  sub,
}: {
  label: string
  value: ReactNode
  sub?: string
}) {
  return (
    <div className="rounded-xl border border-border/80 bg-card px-3 py-3.5 shadow-sm transition-shadow hover:shadow-md sm:px-4 sm:py-4">
      <p className="text-[11px] font-semibold leading-snug text-foreground sm:text-xs">
        {label}
      </p>
      <p className="mt-1.5 text-xl font-bold tabular-nums tracking-tight text-foreground sm:text-2xl">
        {value}
      </p>
      {sub ? (
        <p className="mt-2 border-t border-border/50 pt-2 text-[10px] leading-snug text-muted-foreground sm:text-[11px]">
          {sub}
        </p>
      ) : null}
    </div>
  )
}

type Props = {
  snapshot: AdminCeoBusinessSnapshot | null
  loading: boolean
  error?: string | null
}

export function AdminCeoOverview({ snapshot, loading, error }: Props) {
  if (loading && !snapshot) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-dashed border-border bg-muted/20 px-4 py-8 text-sm text-muted-foreground">
        <LayoutDashboard className="h-5 w-5 animate-pulse text-primary" />
        Cargando indicadores de negocio…
      </div>
    )
  }
  if (error) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
        <div>
          <p className="font-semibold">No se pudo cargar el resumen</p>
          <p className="mt-1 text-destructive/90">{error}</p>
        </div>
      </div>
    )
  }
  if (!snapshot) return null

  const ns = snapshot.northStar
  const ac = snapshot.activation
  const lq = snapshot.liquidity
  const rt = snapshot.retention
  const mo = snapshot.monetization
  const fr = snapshot.friction

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-primary/20 bg-primary/[0.06] px-4 py-4 sm:px-5 sm:py-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/25 bg-background">
            <LayoutDashboard className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-bold text-foreground sm:text-lg">
              Qué está pasando en la plataforma
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground sm:text-sm">
              Cada bloque responde una pregunta concreta de negocio. Los números usan el mismo rango de
              fechas que elegiste arriba. Un partido <strong className="text-foreground">completado</strong>{' '}
              es el que en el sistema figura como jugado y cerrado (no medimos asistencia física en cancha).
            </p>
          </div>
        </div>
      </div>

      <Section
        sectionId="north-star"
        categoryTag="Indicador principal"
        title="Partidos que se completan"
        subtitleQuestion="¿Los encuentros publicados llegan a jugarse y cerrarse en el sistema?"
        description="Compara partidos creados en el período con los que terminaron en estado «completado». Incluye tamaño típico de grupo y cuánto tarda llenarse el cupo cuando eso ocurre."
        icon={<Target className="h-5 w-5" />}
        iconClassName="text-emerald-600 dark:text-emerald-400"
        tone="emerald"
      >
        <Kpi
          label="Partidos completados"
          value={fmtInt(ns.matchesCompleted)}
          sub={`Del total de ${fmtInt(ns.matchesCreated)} partidos creados en este período`}
        />
        <Kpi
          label="Tasa de cierre"
          value={fmtPct(ns.completionRatePct)}
          sub="Porcentaje de creados en el período que llegaron a «completado»"
        />
        <Kpi
          label="Jugadores confirmados por partido (promedio)"
          value={ns.avgConfirmedPlayersPerCompletedMatch.toLocaleString('es-CL', {
            maximumFractionDigits: 2,
          })}
          sub="Solo en partidos ya completados; cuenta filas confirmadas en el roster"
        />
        <Kpi
          label="Horas hasta llenar el cupo (promedio)"
          value={fmtHours(ns.avgHoursToFillBucket)}
          sub={
            ns.fillBucketSampleSize > 0
              ? `Basado en ${ns.fillBucketSampleSize} partidos que alcanzaron el cupo publicado`
              : 'No hubo partidos que llenaran cupo en este período'
          }
        />
      </Section>

      <Section
        sectionId="activation"
        categoryTag="Activación"
        title="Nuevos jugadores"
        subtitleQuestion="¿Quien se registra termina el perfil y juega pronto?"
        description="Mide cuántas cuentas nuevas hay en el período, qué parte completa el onboarding y qué parte participa en al menos un partido dentro de la primera semana."
        icon={<Zap className="h-5 w-5" />}
        iconClassName="text-sky-600 dark:text-sky-400"
        tone="sky"
      >
        <Kpi
          label="Registros nuevos (jugadores)"
          value={fmtInt(ac.newPlayers)}
          sub="Cuentas creadas en el rango de fechas seleccionado"
        />
        <Kpi
          label="Onboarding terminado"
          value={fmtPct(ac.onboardingCompletePct)}
          sub="De esos registros nuevos, con perfil esencial completo"
        />
        <Kpi
          label="Primer partido en 7 días o menos"
          value={fmtPct(ac.firstMatchWithin7DaysPct)}
          sub="De los registros nuevos, con al menos una participación confirmada a tiempo"
        />
        <Kpi
          label="Horas hasta el primer partido (promedio)"
          value={fmtHours(ac.avgHoursToFirstMatch)}
          sub={
            ac.firstMatchSampleSize > 0
              ? `Calculado sobre ${ac.firstMatchSampleSize} jugadores que ya jugaron al menos uno`
              : 'Sin jugadores nuevos con partido en el período'
          }
        />
      </Section>

      <Section
        sectionId="liquidity"
        categoryTag="Liquidez"
        title="Cupos y partidos que se llenan"
        subtitleQuestion="¿El marketplace ofrece partidos que la gente completa o quedan a medias?"
        description="Mira cuántos partidos con cupo definido logran llenarlo, cómo van los cupos agregados y cuántos quedan programados pero incompletos. También la tasa de cancelación de lo creado en el período."
        icon={<Magnet className="h-5 w-5" />}
        iconClassName="text-violet-600 dark:text-violet-400"
        tone="violet"
      >
        <Kpi
          label="Partidos creados en el período"
          value={fmtInt(lq.matchesCreated)}
          sub="Publicaciones nuevas en la ventana de tiempo"
        />
        <Kpi
          label="Partidos que llenaron el cupo"
          value={fmtPct(lq.matchesFilledPct)}
          sub={`${fmtInt(lq.matchesFilled)} de ${fmtInt(lq.matchesFillableWithCap)} tenían cupo > 0 y llegaron al llenado`}
        />
        <Kpi
          label="Cupos ocupados vs cupos buscados"
          value={`${fmtInt(Number(lq.slotsJoined))} / ${fmtInt(Number(lq.slotsNeeded))}`}
          sub={
            lq.slotsNeeded > 0
              ? `${fmtPct(lq.slotsFilledPct)} del total de plazas publicadas`
              : 'Sin cupos definidos en estos partidos'
          }
        />
        <Kpi
          label="Partidos cancelados (del período)"
          value={fmtPct(lq.matchesCancelledPct)}
          sub="Sobre los creados en el mismo rango de fechas"
        />
        <Kpi
          label="Futuros aún sin llenar"
          value={fmtInt(lq.unfilledUpcomingInPeriod)}
          sub="Creados en el período, fecha de juego posterior a hoy y cupo pendiente"
        />
      </Section>

      <Section
        sectionId="retention"
        categoryTag="Retención"
        title="Actividad y hábito de juego"
        subtitleQuestion="¿La gente vuelve a abrir la app y a cerrar más de un partido?"
        description="Actividad reciente por última visita (7 días) y cuántos jugadores ya acumulan varios partidos completados en el historial."
        icon={<Users className="h-5 w-5" />}
        iconClassName="text-amber-600 dark:text-amber-400"
        tone="amber"
      >
        <Kpi
          label="Jugadores activos (últimos 7 días)"
          value={fmtInt(rt.activePlayers7d)}
          sub="Perfil jugador con última actividad registrada en la app"
        />
        <Kpi
          label="Con 2 o más partidos completados"
          value={fmtInt(rt.playersWith2PlusCompletedMatches)}
          sub={`${fmtInt(rt.playersWithCompletedMatch)} jugadores han completado al menos uno`}
        />
        <Kpi
          label="Partidos completados por jugador (promedio)"
          value={rt.avgCompletedMatchesPerParticipatingPlayer.toLocaleString('es-CL', {
            maximumFractionDigits: 2,
          })}
          sub="Solo entre quienes ya tienen al menos un partido completado"
        />
      </Section>

      <Section
        sectionId="monetization"
        categoryTag="Ingresos"
        title="Dinero por reservas de cancha"
        subtitleQuestion="¿Cuánto se cobra y qué tan ocupadas están las canchas según los horarios declarados?"
        description="Suma ingresos con pago o abono registrado, reparte entre partidos ligados a una reserva y muestra ocupación aproximada (minutos reservados confirmados frente a minutos «abiertos» según calendario de centros)."
        icon={<CircleDollarSign className="h-5 w-5" />}
        iconClassName="text-rose-600 dark:text-rose-400"
        tone="rose"
      >
        <Kpi
          label="Ingreso cobrado (pesos chilenos)"
          value={fmtClp(mo.revenueCollectedClp)}
          sub="Reservas no canceladas con pago o abono aplicado en la ventana"
        />
        <Kpi
          label="Ingreso medio por partido con reserva"
          value={
            mo.linkedMatchesWithReservation > 0
              ? fmtClp(Math.round(mo.revenuePerLinkedMatch))
              : '—'
          }
          sub={`${fmtInt(mo.linkedMatchesWithReservation)} partidos distintos vinculados a una reserva`}
        />
        <Kpi
          label="Ocupación de canchas (aprox.)"
          value={fmtPct(mo.courtOccupancyConfirmedPct)}
          sub="Minutos con reserva confirmada / minutos abiertos estimados (todos los centros)"
        />
        <Kpi
          label="Movimientos de reserva en la ventana"
          value={fmtInt(mo.reservationsInWindow)}
          sub={`${fmtPct(mo.reservationsCancelledPct)} fueron cancelaciones`}
        />
      </Section>

      <Section
        sectionId="friction"
        categoryTag="Fricción"
        title="Cuellos de botella y moderación"
        subtitleQuestion="¿Hay colas sin resolver, bloqueos o partidos que no cierran cupo?"
        description="Listas de espera en revueltas privadas y en equipos, usuarios bloqueados o suspendidos, y partidos futuros aún incompletos. Los fallos al pulsar «unirse» no se guardan hoy en base de datos (aparece como no disponible)."
        icon={<ArrowDownRight className="h-5 w-5" />}
        iconClassName="text-muted-foreground"
        tone="slate"
      >
        <Kpi
          label="Errores al unirse a un partido"
          value={fr.joinRpcErrorRatePct !== null ? fmtPct(fr.joinRpcErrorRatePct) : 'No medido'}
          sub={
            fr.joinRpcErrorNote
              ? 'Aún no registramos intentos fallidos en servidor; ver nota técnica'
              : 'Sin dato'
          }
        />
        <Kpi
          label="Solicitudes a revuelta privada pendientes"
          value={fmtInt(fr.pendingRevueltaRequests)}
          sub="Esperando respuesta del organizador o capitán"
        />
        <Kpi
          label="Solicitudes para entrar a un equipo"
          value={fmtInt(fr.pendingTeamJoinRequests)}
          sub="Pendientes de aceptar o rechazar"
        />
        <Kpi
          label="Cuentas bloqueadas"
          value={`${fmtInt(fr.playersBanned)} de ${fmtInt(fr.playersTotal)} jugadores`}
          sub={`${fmtPct(fr.pctPlayersBanned)} del total de perfiles jugador`}
        />
        <Kpi
          label="Suspensiones activas ahora"
          value={fmtInt(fr.playersSuspendedNow)}
          sub="Restricción temporal aún vigente"
        />
        <Kpi
          label="Partidos futuros sin cupo completo"
          value={fmtInt(fr.unfilledFutureMatchesInPeriod)}
          sub="Mismo criterio que en liquidez: creados en el período y fecha por delante"
        />
      </Section>

      <div className="flex flex-col gap-2 rounded-xl border border-border/80 bg-muted/30 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-start gap-2 text-[11px] text-muted-foreground sm:text-xs">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <span>
            <span className="font-medium text-foreground">Período analizado: </span>
            <span className="font-mono">
              {snapshot.meta.from.slice(0, 10)} → {snapshot.meta.to.slice(0, 10)}
            </span>
            <span className="text-muted-foreground"> · zona horaria {snapshot.meta.timezone}</span>
          </span>
        </p>
      </div>
    </div>
  )
}
