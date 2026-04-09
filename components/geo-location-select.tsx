'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, MapPin } from 'lucide-react'
import {
  getBrowserSupabase,
  isSupabaseConfigured,
} from '@/lib/supabase/client'
import {
  fetchGeoCatalogActive,
  type GeoCatalogActive,
} from '@/lib/supabase/geo-queries'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

export type GeoLocationChange = {
  cityId: string
  /** Nombre para `profiles.city` / `sports_venues.city`. */
  cityLabel: string
}

type Props = {
  /** `city_id` en base de datos. */
  cityId: string
  onChange: (next: GeoLocationChange) => void
  disabled?: boolean
  className?: string
  /** Texto encima del bloque (opcional). */
  label?: string
  /** Ocultar icono MapPin en la etiqueta. */
  hideIcon?: boolean
}

function findCityPath(
  countries: GeoCatalogActive['countries'],
  targetCityId: string
): {
  country: GeoCatalogActive['countries'][0]
  region: GeoCatalogActive['countries'][0]['regions'][0]
  city: GeoCatalogActive['countries'][0]['regions'][0]['cities'][0]
} | null {
  for (const c of countries) {
    for (const r of c.regions) {
      const city = r.cities.find((ci) => ci.id === targetCityId)
      if (city) return { country: c, region: r, city }
    }
  }
  return null
}

function firstCity(
  countries: GeoCatalogActive['countries']
): GeoLocationChange | null {
  const c0 = countries[0]
  const r0 = c0?.regions[0]
  const ci0 = r0?.cities[0]
  if (!ci0) return null
  return { cityId: ci0.id, cityLabel: ci0.name }
}

/**
 * Selects encadenados País → Región → Ciudad (catálogo `geo_*`).
 * Con un solo país/región/ciudad, los selects quedan deshabilitados.
 */
export function GeoLocationSelect({
  cityId,
  onChange,
  disabled,
  className,
  label = 'Ubicación',
  hideIcon,
}: Props) {
  const [loading, setLoading] = useState(true)
  const [catalog, setCatalog] = useState<GeoCatalogActive['countries']>([])
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    let mounted = true
    ;(async () => {
      if (!isSupabaseConfigured()) {
        if (mounted) setLoading(false)
        return
      }
      const supabase = getBrowserSupabase()
      if (!supabase) {
        if (mounted) setLoading(false)
        return
      }
      const { countries } = await fetchGeoCatalogActive(supabase)
      if (!mounted) return
      setCatalog(countries)
      setLoading(false)
    })()
    return () => {
      mounted = false
    }
  }, [])

  const path = useMemo(() => {
    if (catalog.length === 0) return null
    if (cityId) {
      const p = findCityPath(catalog, cityId)
      if (p) return p
    }
    const c0 = catalog[0]
    const r0 = c0?.regions[0]
    const ci0 = r0?.cities[0]
    if (!c0 || !r0 || !ci0) return null
    return { country: c0, region: r0, city: ci0 }
  }, [catalog, cityId])

  useEffect(() => {
    if (loading || catalog.length === 0) return
    if (cityId) {
      const p = findCityPath(catalog, cityId)
      if (p) return
    }
    const first = firstCity(catalog)
    if (first) onChangeRef.current(first)
  }, [loading, catalog, cityId])

  if (loading) {
    return (
      <div className={cn('flex items-center gap-2 text-muted-foreground', className)}>
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">Cargando ubicaciones…</span>
      </div>
    )
  }

  if (!path || catalog.length === 0) {
    return (
      <p className={cn('text-sm text-muted-foreground', className)}>
        No hay ciudades disponibles en el catálogo.
      </p>
    )
  }

  const { country, region, city } = path
  const singleCountry = catalog.length <= 1
  const singleRegion = country.regions.length <= 1
  const singleCity = region.cities.length <= 1

  const setCountry = (countryId: string) => {
    const c = catalog.find((x) => x.id === countryId)
    const r = c?.regions[0]
    const ci = r?.cities[0]
    if (!c || !r || !ci) return
    onChange({ cityId: ci.id, cityLabel: ci.name })
  }

  const setRegion = (regionId: string) => {
    const r = country.regions.find((x) => x.id === regionId)
    const ci = r?.cities[0]
    if (!r || !ci) return
    onChange({ cityId: ci.id, cityLabel: ci.name })
  }

  const setCity = (nextCityId: string) => {
    const ci = region.cities.find((x) => x.id === nextCityId)
    if (!ci) return
    onChange({ cityId: ci.id, cityLabel: ci.name })
  }

  return (
    <div className={cn('space-y-3', className)}>
      <Label className="text-foreground flex items-center gap-2">
        {!hideIcon ? <MapPin className="w-4 h-4 text-primary" /> : null}
        {label}
      </Label>
      <div className="grid gap-3 sm:grid-cols-1">
        <div className="space-y-1.5">
          <span className="text-xs text-muted-foreground">País</span>
          <Select
            value={country.id}
            onValueChange={setCountry}
            disabled={disabled || singleCountry}
          >
            <SelectTrigger
              className={cn(
                'h-12 w-full bg-secondary border-border',
                (disabled || singleCountry) && 'opacity-80'
              )}
            >
              <SelectValue placeholder="País" />
            </SelectTrigger>
            <SelectContent>
              {catalog.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <span className="text-xs text-muted-foreground">Región</span>
          <Select
            value={region.id}
            onValueChange={setRegion}
            disabled={disabled || singleRegion}
          >
            <SelectTrigger
              className={cn(
                'h-12 w-full bg-secondary border-border',
                (disabled || singleRegion) && 'opacity-80'
              )}
            >
              <SelectValue placeholder="Región" />
            </SelectTrigger>
            <SelectContent>
              {country.regions.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.code ? `${r.name} (${r.code})` : r.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <span className="text-xs text-muted-foreground">Ciudad</span>
          <Select
            value={city.id}
            onValueChange={setCity}
            disabled={disabled || singleCity}
          >
            <SelectTrigger
              className={cn(
                'h-12 w-full bg-secondary border-border',
                (disabled || singleCity) && 'opacity-80'
              )}
            >
              <SelectValue placeholder="Ciudad" />
            </SelectTrigger>
            <SelectContent>
              {region.cities.map((ci) => (
                <SelectItem key={ci.id} value={ci.id}>
                  {ci.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {(singleCountry && singleRegion && singleCity) ? (
        <p className="text-xs text-muted-foreground">
          Por ahora solo está disponible esta ubicación; podrás elegir otras cuando
          se agreguen al catálogo.
        </p>
      ) : null}
    </div>
  )
}
