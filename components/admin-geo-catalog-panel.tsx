'use client'

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import type { LucideIcon } from 'lucide-react'
import {
  Building2,
  ChevronDown,
  ChevronsDownUp,
  ChevronsUpDown,
  Globe2,
  Layers,
  Loader2,
  MapPinned,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Checkbox } from '@/components/ui/checkbox'
import {
  getBrowserSessionAccessToken,
  isSupabaseConfigured,
} from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

/** Misma lógica que `slugify` en `/api/admin/geo` (vista previa al crear ciudad). */
function slugifyGeoPreview(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
}

function GeoSubsection({
  title,
  subtitle,
  icon: Icon,
  badge,
  actions,
  children,
  className,
}: {
  title: string
  subtitle?: string
  icon: LucideIcon
  badge?: string
  actions?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-xl border border-border/80 bg-card/90 shadow-sm ring-1 ring-black/[0.04] dark:ring-white/[0.06]',
        className
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border/60 bg-gradient-to-r from-muted/50 via-muted/25 to-transparent px-4 py-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary">
            <Icon className="h-4 w-4" aria-hidden />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold tracking-tight text-foreground">{title}</h3>
              {badge ? (
                <Badge variant="secondary" className="font-mono text-[10px] font-normal tabular-nums">
                  {badge}
                </Badge>
              ) : null}
            </div>
            {subtitle ? (
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{subtitle}</p>
            ) : null}
          </div>
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
      </div>
      <div className="p-4">{children}</div>
    </div>
  )
}

type GeoCountryRow = {
  id: string
  iso_code: string
  name: string
  is_active: boolean
}
type GeoRegionRow = {
  id: string
  country_id: string
  code: string
  name: string
  is_active: boolean
}
type GeoCityRow = {
  id: string
  region_id: string
  name: string
  slug: string
  is_active: boolean
}

async function adminJsonFetch(
  path: string,
  init?: RequestInit & { json?: unknown }
): Promise<Response> {
  const headers: Record<string, string> = {
    ...(init?.headers as Record<string, string>),
  }
  if (init?.json !== undefined) {
    headers['Content-Type'] = 'application/json'
  }
  if (isSupabaseConfigured()) {
    const token = await getBrowserSessionAccessToken()
    if (token) headers.Authorization = `Bearer ${token}`
  }
  return fetch(path, {
    ...init,
    headers,
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
  })
}

export function AdminGeoCatalogPanel() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [countries, setCountries] = useState<GeoCountryRow[]>([])
  const [regions, setRegions] = useState<GeoRegionRow[]>([])
  const [cities, setCities] = useState<GeoCityRow[]>([])

  const [newCountry, setNewCountry] = useState({ isoCode: '', name: '' })
  const [newRegion, setNewRegion] = useState({
    countryId: '',
    code: '',
    name: '',
  })
  const [newCity, setNewCity] = useState({
    regionId: '',
    name: '',
    slug: '',
  })

  const [cityQuery, setCityQuery] = useState('')
  const [cityRegionFilter, setCityRegionFilter] = useState<string>('')
  const [citiesInactiveOnly, setCitiesInactiveOnly] = useState(false)
  const [selectedCityIds, setSelectedCityIds] = useState<Set<string>>(() => new Set())
  const [regionSectionQuery, setRegionSectionQuery] = useState('')
  const [cityCollapsibleKey, setCityCollapsibleKey] = useState(0)
  const [defaultExpandAllCityRegions, setDefaultExpandAllCityRegions] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await adminJsonFetch('/api/admin/geo')
      const j = (await r.json()) as {
        countries?: GeoCountryRow[]
        regions?: GeoRegionRow[]
        cities?: GeoCityRow[]
        error?: string
      }
      if (!r.ok) throw new Error(j.error ?? 'Error al cargar catálogo')
      const nextCountries = j.countries ?? []
      const nextRegions = j.regions ?? []
      setCountries(nextCountries)
      setRegions(nextRegions)
      setCities(j.cities ?? [])
      setNewRegion((prev) =>
        prev.countryId
          ? prev
          : nextCountries[0]
            ? { ...prev, countryId: nextCountries[0].id }
            : prev
      )
      setNewCity((prev) =>
        prev.regionId
          ? prev
          : nextRegions[0]
            ? { ...prev, regionId: nextRegions[0].id }
            : prev
      )
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al cargar')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  type PostOpts = { reload?: boolean; toastMessage?: string | false }

  const postAction = async (
    json: Record<string, unknown>,
    opts?: PostOpts
  ): Promise<boolean> => {
    const reload = opts?.reload !== false
    const toastMsg = opts?.toastMessage
    setSaving(true)
    try {
      const r = await adminJsonFetch('/api/admin/geo', {
        method: 'POST',
        json,
      })
      const j = (await r.json()) as { error?: string; ok?: boolean }
      if (!r.ok) throw new Error(j.error ?? 'Error')
      if (toastMsg === false) {
        /* silencioso (ej. interruptor Activo) */
      } else if (toastMsg !== undefined) {
        toast.success(toastMsg)
      } else if (reload) {
        toast.success('Guardado')
      }
      if (json.action === 'updateCity' && !reload && typeof json.id === 'string') {
        const id = json.id as string
        const patch = json as { name?: string; slug?: string; isActive?: boolean }
        setCities((prev) =>
          prev.map((c) =>
            c.id === id
              ? {
                  ...c,
                  ...(patch.name !== undefined && { name: patch.name }),
                  ...(patch.slug !== undefined && { slug: patch.slug }),
                  ...(patch.isActive !== undefined && { is_active: patch.isActive }),
                }
              : c
          )
        )
      }
      if (reload) await load()
      return true
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error')
      return false
    } finally {
      setSaving(false)
    }
  }

  const setCityBulkSelected = (id: string, checked: boolean) => {
    setSelectedCityIds((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  const handleCityPatch =
    (cityId: string) =>
    (patch: { name?: string; slug?: string; isActive?: boolean }) => {
      const onlyIsActive =
        Object.keys(patch).length === 1 && patch.isActive !== undefined
      void postAction(
        { action: 'updateCity', id: cityId, ...patch },
        onlyIsActive ? { reload: false, toastMessage: false } : undefined
      )
    }

  const regionLabel = (r: GeoRegionRow) => {
    const c = countries.find((x) => x.id === r.country_id)
    return `${c?.name ?? '?'} — ${r.name} (${r.code})`
  }

  const filteredCities = useMemo(() => {
    let list = cities
    if (citiesInactiveOnly) list = list.filter((c) => !c.is_active)
    if (cityRegionFilter) list = list.filter((c) => c.region_id === cityRegionFilter)
    const q = cityQuery.trim().toLowerCase()
    if (q) {
      list = list.filter((ci) => {
        const reg = regions.find((r) => r.id === ci.region_id)
        const regName = reg?.name?.toLowerCase() ?? ''
        return (
          ci.name.toLowerCase().includes(q) ||
          ci.slug.toLowerCase().includes(q) ||
          regName.includes(q)
        )
      })
    }
    return list
  }, [cities, citiesInactiveOnly, cityRegionFilter, cityQuery, regions])

  const bulkActivateSelected = async () => {
    const ids = [...selectedCityIds]
    if (ids.length === 0) return
    setSaving(true)
    try {
      const r = await adminJsonFetch('/api/admin/geo', {
        method: 'POST',
        json: { action: 'bulkUpdateCities', ids, isActive: true },
      })
      const j = (await r.json()) as { error?: string; ok?: boolean; updated?: number }
      if (!r.ok) throw new Error(j.error ?? 'Error')
      const n = j.updated ?? ids.length
      toast.success(n === 1 ? '1 ciudad activada.' : `${n} ciudades activadas.`)
      setSelectedCityIds(new Set())
      setCities((prev) =>
        prev.map((c) => (ids.includes(c.id) ? { ...c, is_active: true } : c))
      )
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error')
    } finally {
      setSaving(false)
    }
  }

  const inactiveCityCount = useMemo(
    () => cities.filter((c) => !c.is_active).length,
    [cities]
  )

  const filteredRegionsForList = useMemo(() => {
    const q = regionSectionQuery.trim().toLowerCase()
    if (!q) return regions
    return regions.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.code.toLowerCase().includes(q) ||
        (countries.find((c) => c.id === r.country_id)?.name.toLowerCase().includes(q) ?? false)
    )
  }, [regions, regionSectionQuery, countries])

  const inactiveFilteredCityIds = useMemo(
    () => filteredCities.filter((c) => !c.is_active).map((c) => c.id),
    [filteredCities]
  )

  const selectInactiveVisible = () => {
    setSelectedCityIds((prev) => {
      const next = new Set(prev)
      for (const id of inactiveFilteredCityIds) next.add(id)
      return next
    })
  }

  const clearCitySelection = () => setSelectedCityIds(new Set())

  const expandAllCityRegionGroups = () => {
    setDefaultExpandAllCityRegions(true)
    setCityCollapsibleKey((k) => k + 1)
  }

  const collapseAllCityRegionGroups = () => {
    setDefaultExpandAllCityRegions(false)
    setCityCollapsibleKey((k) => k + 1)
  }

  const useGroupedCityList = !cityQuery.trim() && !cityRegionFilter

  const citiesByRegion = useMemo(() => {
    const map = new Map<string, GeoCityRow[]>()
    for (const ci of filteredCities) {
      const arr = map.get(ci.region_id) ?? []
      arr.push(ci)
      map.set(ci.region_id, arr)
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => a.name.localeCompare(b.name, 'es'))
    }
    const regionIds = [...map.keys()].sort((a, b) => {
      const ra = regions.find((r) => r.id === a)
      const rb = regions.find((r) => r.id === b)
      return (ra?.name ?? a).localeCompare(rb?.name ?? b, 'es')
    })
    return regionIds.map((id) => ({
      regionId: id,
      region: regions.find((r) => r.id === id),
      cities: map.get(id) ?? [],
    }))
  }, [filteredCities, regions])

  const hasCityFilters =
    cityQuery.trim().length > 0 || !!cityRegionFilter || citiesInactiveOnly

  const clearCityFilters = () => {
    setCityQuery('')
    setCityRegionFilter('')
    setCitiesInactiveOnly(false)
  }

  return (
    <Card className="bg-card border-border">
      <CardContent className="p-4 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <MapPinned className="h-5 w-5 text-primary" />
            <div>
              <p className="font-medium text-foreground">Catálogo geográfico</p>
              <p className="text-xs text-muted-foreground">
                País → región → ciudad. Desactivar oculta la opción en selects sin borrar datos.
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={loading || saving}
            onClick={() => void load()}
          >
            <RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Cargando…
          </div>
        ) : (
          <>
            <div className="grid gap-6 xl:grid-cols-[minmax(0,380px)_minmax(0,1fr)] xl:items-start">
              <div className="flex min-w-0 flex-col gap-6">
                <GeoSubsection
                  title="Países"
                  icon={Globe2}
                  badge={String(countries.length)}
                  subtitle="ISO de 2 letras y nombre. Desactivar oculta el país en selects sin borrar datos."
                >
              <div className="flex flex-wrap gap-2 items-end">
                <div className="space-y-1">
                  <Label className="text-xs">ISO (2 letras)</Label>
                  <Input
                    className="h-9 w-20 bg-secondary uppercase"
                    maxLength={2}
                    value={newCountry.isoCode}
                    onChange={(e) =>
                      setNewCountry((s) => ({
                        ...s,
                        isoCode: e.target.value.slice(0, 2).toLowerCase(),
                      }))
                    }
                  />
                </div>
                <div className="space-y-1 flex-1 min-w-[140px]">
                  <Label className="text-xs">Nombre</Label>
                  <Input
                    className="h-9 bg-secondary"
                    value={newCountry.name}
                    onChange={(e) =>
                      setNewCountry((s) => ({ ...s, name: e.target.value }))
                    }
                  />
                </div>
                <Button
                  type="button"
                  size="sm"
                  disabled={saving}
                  onClick={() => {
                    void (async () => {
                      const ok = await postAction({
                        action: 'createCountry',
                        isoCode: newCountry.isoCode,
                        name: newCountry.name,
                      })
                      if (ok) setNewCountry({ isoCode: '', name: '' })
                    })()
                  }}
                >
                  <Plus className="mr-1 h-4 w-4" />
                  Agregar
                </Button>
              </div>
              <ul className="divide-y divide-border rounded-lg border border-border/80 bg-background/40">
                {countries.map((c) => (
                  <CountryLine
                    key={c.id}
                    row={c}
                    disabled={saving}
                    onUpdate={(patch) =>
                      void postAction({ action: 'updateCountry', id: c.id, ...patch })
                    }
                    onDelete={() => {
                      if (
                        !confirm(
                          `¿Eliminar país "${c.name}"? Solo si no tiene regiones.`
                        )
                      )
                        return
                      void postAction({ action: 'deleteCountry', id: c.id })
                    }}
                  />
                ))}
              </ul>
                </GeoSubsection>

                <GeoSubsection
                  title="Regiones"
                  icon={Layers}
                  badge={
                    regionSectionQuery.trim()
                      ? `${filteredRegionsForList.length}/${regions.length}`
                      : String(regions.length)
                  }
                  subtitle="Lista con scroll y filtro local. Código en mayúsculas (ej. RM, VIII)."
                >
              <div className="relative mb-3">
                <Search
                  className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  className="h-9 bg-secondary pl-9 pr-9"
                  placeholder="Filtrar por nombre, código o país…"
                  value={regionSectionQuery}
                  onChange={(e) => setRegionSectionQuery(e.target.value)}
                  autoComplete="off"
                />
                {regionSectionQuery ? (
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                    onClick={() => setRegionSectionQuery('')}
                    aria-label="Limpiar filtro de regiones"
                  >
                    <X className="h-4 w-4" />
                  </button>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2 items-end">
                <div className="space-y-1 min-w-[160px]">
                  <Label className="text-xs">País</Label>
                  <Select
                    value={newRegion.countryId}
                    onValueChange={(v) =>
                      setNewRegion((s) => ({ ...s, countryId: v }))
                    }
                  >
                    <SelectTrigger className="h-9 w-full bg-secondary">
                      <SelectValue placeholder="País" />
                    </SelectTrigger>
                    <SelectContent>
                      {countries.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name} ({c.iso_code})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1 w-20">
                  <Label className="text-xs">Código</Label>
                  <Input
                    className="h-9 bg-secondary uppercase"
                    value={newRegion.code}
                    onChange={(e) =>
                      setNewRegion((s) => ({
                        ...s,
                        code: e.target.value.toUpperCase(),
                      }))
                    }
                  />
                </div>
                <div className="space-y-1 flex-1 min-w-[160px]">
                  <Label className="text-xs">Nombre</Label>
                  <Input
                    className="h-9 bg-secondary"
                    value={newRegion.name}
                    onChange={(e) =>
                      setNewRegion((s) => ({ ...s, name: e.target.value }))
                    }
                  />
                </div>
                <Button
                  type="button"
                  size="sm"
                  disabled={saving || !newRegion.countryId}
                  onClick={() => {
                    void (async () => {
                      const ok = await postAction({
                        action: 'createRegion',
                        countryId: newRegion.countryId,
                        code: newRegion.code,
                        name: newRegion.name,
                      })
                      if (ok) setNewRegion((s) => ({ ...s, code: '', name: '' }))
                    })()
                  }}
                >
                  <Plus className="mr-1 h-4 w-4" />
                  Agregar
                </Button>
              </div>
              <ul className="mt-3 max-h-[min(42vh,440px)] divide-y divide-border overflow-y-auto rounded-lg border border-border/80 bg-background/40 [scrollbar-width:thin]">
                {filteredRegionsForList.length === 0 ? (
                  <li className="px-3 py-6 text-center text-xs text-muted-foreground">
                    Ninguna región coincide con el filtro.
                  </li>
                ) : null}
                {filteredRegionsForList.map((r) => (
                  <RegionLine
                    key={r.id}
                    row={r}
                    countryIso={
                      countries.find((c) => c.id === r.country_id)?.iso_code ?? ''
                    }
                    disabled={saving}
                    onUpdate={(patch) =>
                      void postAction({ action: 'updateRegion', id: r.id, ...patch })
                    }
                    onDelete={() => {
                      if (
                        !confirm(
                          `¿Eliminar región "${r.name}"? Solo si no tiene ciudades.`
                        )
                      )
                        return
                      void postAction({ action: 'deleteRegion', id: r.id })
                    }}
                  />
                ))}
              </ul>
                </GeoSubsection>
              </div>

              <div className="min-w-0 space-y-4">
                <GeoSubsection
                  title="Ciudades"
                  icon={Building2}
                  badge={`${filteredCities.length} / ${cities.length}`}
                  subtitle="Casillas para activar en bloque. Vista agrupada por región: expande o contrae todo cuando no hay búsqueda por región."
                  actions={
                    <Button
                      type="button"
                      size="sm"
                      className="h-9 shrink-0"
                      disabled={saving || selectedCityIds.size === 0}
                      onClick={() => void bulkActivateSelected()}
                    >
                      {selectedCityIds.size === 0
                        ? 'Activar marcadas'
                        : selectedCityIds.size === 1
                          ? 'Activar 1'
                          : `Activar ${selectedCityIds.size}`}
                    </Button>
                  }
                >
              <div className="mb-4 flex flex-col gap-2 rounded-lg border border-border/60 bg-muted/15 p-3 sm:flex-row sm:flex-wrap sm:items-center">
                <p className="text-[11px] font-medium text-muted-foreground sm:mr-auto">
                  Acciones rápidas
                </p>
                <div className="flex flex-wrap gap-2">
                  {useGroupedCityList ? (
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1.5 text-xs"
                        disabled={saving}
                        onClick={expandAllCityRegionGroups}
                      >
                        <ChevronsDownUp className="h-3.5 w-3.5" />
                        Expandir grupos
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1.5 text-xs"
                        disabled={saving}
                        onClick={collapseAllCityRegionGroups}
                      >
                        <ChevronsUpDown className="h-3.5 w-3.5" />
                        Contraer grupos
                      </Button>
                    </>
                  ) : null}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    disabled={saving || inactiveFilteredCityIds.length === 0}
                    onClick={selectInactiveVisible}
                  >
                    Marcar inactivas visibles
                    {inactiveFilteredCityIds.length > 0 ? (
                      <span className="ml-1 tabular-nums text-muted-foreground">
                        ({inactiveFilteredCityIds.length})
                      </span>
                    ) : null}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs"
                    disabled={saving || selectedCityIds.size === 0}
                    onClick={clearCitySelection}
                  >
                    Quitar selección
                  </Button>
                </div>
              </div>

              <div className="space-y-3 rounded-xl border border-border/70 bg-muted/20 p-3 sm:p-4">
                <p className="text-xs font-medium text-foreground">Buscar y filtrar</p>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
                  <div className="relative min-w-0 flex-1 space-y-1">
                    <Label className="text-xs">Buscar ciudad o comuna</Label>
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        className="h-9 bg-background pl-9 pr-9"
                        placeholder="Nombre, slug o región…"
                        value={cityQuery}
                        onChange={(e) => setCityQuery(e.target.value)}
                        autoComplete="off"
                      />
                      {cityQuery ? (
                        <button
                          type="button"
                          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                          onClick={() => setCityQuery('')}
                          aria-label="Limpiar búsqueda"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <div className="w-full space-y-1 min-[480px]:max-w-[280px] lg:w-[280px]">
                    <Label className="text-xs">Región</Label>
                    <Select
                      value={cityRegionFilter || 'all'}
                      onValueChange={(v) => setCityRegionFilter(v === 'all' ? '' : v)}
                    >
                      <SelectTrigger className="h-9 w-full bg-background">
                        <SelectValue placeholder="Todas" />
                      </SelectTrigger>
                      <SelectContent className="max-h-[min(280px,50vh)]">
                        <SelectItem value="all">Todas las regiones</SelectItem>
                        {regions.map((r) => (
                          <SelectItem key={r.id} value={r.id}>
                            {regionLabel(r)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
                      <Switch
                        id="geo-cities-inactive"
                        checked={citiesInactiveOnly}
                        onCheckedChange={setCitiesInactiveOnly}
                      />
                      <Label htmlFor="geo-cities-inactive" className="cursor-pointer text-xs">
                        Solo inactivas
                        {inactiveCityCount > 0 ? (
                          <span className="ml-1 text-muted-foreground">({inactiveCityCount})</span>
                        ) : null}
                      </Label>
                    </div>
                    {hasCityFilters ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-9 text-xs"
                        onClick={clearCityFilters}
                      >
                        Quitar filtros
                      </Button>
                    ) : null}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Mostrando{' '}
                  <span className="font-medium text-foreground">{filteredCities.length}</span> de{' '}
                  <span className="font-medium text-foreground">{cities.length}</span> ciudades
                  {useGroupedCityList ? (
                    <span className="hidden sm:inline">
                      {' '}
                      · Agrupadas por región (toca para expandir)
                    </span>
                  ) : null}
                </p>
              </div>

              <div className="space-y-3 rounded-xl border border-dashed border-primary/20 bg-gradient-to-br from-primary/[0.04] to-transparent p-3 sm:p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-foreground">Alta rápida de ciudad</p>
                  {cityRegionFilter ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() =>
                        setNewCity((s) => ({ ...s, regionId: cityRegionFilter }))
                      }
                    >
                      Aplicar región del filtro
                    </Button>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2 items-end">
                  <div className="space-y-1 min-w-[200px] flex-1">
                    <Label className="text-xs">Región</Label>
                    <Select
                      value={newCity.regionId}
                      onValueChange={(v) => setNewCity((s) => ({ ...s, regionId: v }))}
                    >
                      <SelectTrigger className="h-9 w-full bg-secondary">
                        <SelectValue placeholder="Región" />
                      </SelectTrigger>
                      <SelectContent className="max-h-[min(280px,50vh)]">
                        {regions.map((r) => (
                          <SelectItem key={r.id} value={r.id}>
                            {regionLabel(r)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1 min-w-[140px] flex-1">
                    <Label className="text-xs">Nombre</Label>
                    <Input
                      className="h-9 bg-secondary"
                      placeholder="Ej. Rancagua"
                      value={newCity.name}
                      onChange={(e) =>
                        setNewCity((s) => ({ ...s, name: e.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-1 w-full min-[420px]:w-32">
                    <Label className="text-xs">Slug (opcional)</Label>
                    <Input
                      className="h-9 bg-secondary font-mono text-xs"
                      placeholder="Vacío = auto"
                      value={newCity.slug}
                      onChange={(e) =>
                        setNewCity((s) => ({ ...s, slug: e.target.value }))
                      }
                    />
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    className="h-9"
                    disabled={saving || !newCity.regionId}
                    onClick={() => {
                      void (async () => {
                        const ok = await postAction({
                          action: 'createCity',
                          regionId: newCity.regionId,
                          name: newCity.name,
                          ...(newCity.slug.trim() ? { slug: newCity.slug } : {}),
                        })
                        if (ok) setNewCity((s) => ({ ...s, name: '', slug: '' }))
                      })()
                    }}
                  >
                    <Plus className="mr-1 h-4 w-4" />
                    Agregar
                  </Button>
                </div>
                {newCity.name.trim() ? (
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    Slug que aplicará el servidor:{' '}
                    <code className="rounded-md border border-border/60 bg-muted/60 px-2 py-0.5 font-mono text-[11px] text-foreground">
                      {newCity.slug.trim()
                        ? slugifyGeoPreview(newCity.slug)
                        : slugifyGeoPreview(newCity.name) || '—'}
                    </code>
                  </p>
                ) : (
                  <p className="text-[11px] text-muted-foreground">
                    Si dejas el slug vacío, se genera a partir del nombre (misma regla que en API).
                  </p>
                )}
              </div>

              {filteredCities.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                  No hay ciudades con estos filtros. Prueba otra búsqueda o quita &quot;Solo
                  inactivas&quot;.
                </p>
              ) : useGroupedCityList ? (
                <div className="max-h-[min(70dvh,680px)] space-y-2 overflow-y-auto rounded-lg border border-border/50 bg-muted/5 p-2 pr-1 [scrollbar-width:thin]">
                  {citiesByRegion.map(({ regionId, region, cities: groupCities }) => {
                    const inactiveInGroup = groupCities.filter((c) => !c.is_active).length
                    return (
                      <Collapsible
                        key={`${regionId}-${cityCollapsibleKey}`}
                        defaultOpen={
                          defaultExpandAllCityRegions ||
                          (!defaultExpandAllCityRegions &&
                            inactiveInGroup > 0 &&
                            citiesInactiveOnly)
                        }
                        className="group rounded-xl border border-border/80 bg-card/90 shadow-sm data-[state=open]:ring-1 data-[state=open]:ring-primary/15"
                      >
                        <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 rounded-t-xl px-3 py-2.5 text-left text-sm hover:bg-muted/40">
                          <span className="min-w-0 font-medium text-foreground">
                            {region ? region.name : regionId}
                            <span className="ml-2 font-normal text-muted-foreground">
                              · {groupCities.length}{' '}
                              {groupCities.length === 1 ? 'ciudad' : 'ciudades'}
                              {inactiveInGroup > 0 ? (
                                <span className="text-amber-600 dark:text-amber-400">
                                  {' '}
                                  ({inactiveInGroup} inactivas)
                                </span>
                              ) : null}
                            </span>
                          </span>
                          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <ul className="divide-y divide-border border-t border-border/60">
                            {groupCities.map((ci) => {
                              const reg = regions.find((r) => r.id === ci.region_id)
                              return (
                                <CityLine
                                  key={ci.id}
                                  row={ci}
                                  showRegionColumn={false}
                                  regionHint={reg ? regionLabel(reg) : ci.region_id}
                                  disabled={saving}
                                  bulkSelected={selectedCityIds.has(ci.id)}
                                  onBulkCheckedChange={(on) => setCityBulkSelected(ci.id, on)}
                                  onUpdate={handleCityPatch(ci.id)}
                                  onDelete={() => {
                                    if (
                                      !confirm(
                                        `¿Eliminar ciudad "${ci.name}"? Fallará si hay usuarios o centros en esa ciudad.`
                                      )
                                    )
                                      return
                                    void postAction({ action: 'deleteCity', id: ci.id })
                                  }}
                                />
                              )
                            })}
                          </ul>
                        </CollapsibleContent>
                      </Collapsible>
                    )
                  })}
                </div>
              ) : (
                <ul className="max-h-[min(70dvh,680px)] divide-y divide-border overflow-y-auto rounded-xl border border-border/70 bg-card/40 [scrollbar-width:thin]">
                  {[...filteredCities]
                    .sort((a, b) => {
                      const ra = regions.find((r) => r.id === a.region_id)?.name ?? ''
                      const rb = regions.find((r) => r.id === b.region_id)?.name ?? ''
                      const c = ra.localeCompare(rb, 'es')
                      return c !== 0 ? c : a.name.localeCompare(b.name, 'es')
                    })
                    .map((ci) => {
                      const reg = regions.find((r) => r.id === ci.region_id)
                      return (
                        <CityLine
                          key={ci.id}
                          row={ci}
                          regionHint={reg ? regionLabel(reg) : ci.region_id}
                          disabled={saving}
                          bulkSelected={selectedCityIds.has(ci.id)}
                          onBulkCheckedChange={(on) => setCityBulkSelected(ci.id, on)}
                          onUpdate={handleCityPatch(ci.id)}
                          onDelete={() => {
                            if (
                              !confirm(
                                `¿Eliminar ciudad "${ci.name}"? Fallará si hay usuarios o centros en esa ciudad.`
                              )
                            )
                              return
                            void postAction({ action: 'deleteCity', id: ci.id })
                          }}
                        />
                      )
                    })}
                </ul>
              )}
                </GeoSubsection>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function CountryLine({
  row,
  disabled,
  onUpdate,
  onDelete,
}: {
  row: GeoCountryRow
  disabled: boolean
  onUpdate: (patch: {
    isoCode?: string
    name?: string
    isActive?: boolean
  }) => void
  onDelete: () => void
}) {
  const [editOpen, setEditOpen] = useState(false)
  const [name, setName] = useState(row.name)
  const [iso, setIso] = useState(row.iso_code)
  useEffect(() => {
    setName(row.name)
    setIso(row.iso_code)
  }, [row.id, row.name, row.iso_code])

  return (
    <li className="flex flex-col gap-2 border-b border-border/40 px-3 py-2.5 text-sm last:border-0 hover:bg-muted/25 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-3">
      <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-medium text-foreground">{row.name}</span>
        <code className="text-xs text-muted-foreground">{row.iso_code}</code>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Activo</span>
          <Switch
            checked={row.is_active}
            disabled={disabled}
            onCheckedChange={(v) => onUpdate({ isActive: v })}
          />
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          disabled={disabled}
          onClick={() => setEditOpen(true)}
        >
          <Pencil className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-destructive"
          disabled={disabled}
          onClick={onDelete}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar país</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label>ISO</Label>
              <Input
                value={iso}
                maxLength={2}
                className="bg-secondary uppercase"
                onChange={(e) => setIso(e.target.value.toLowerCase().slice(0, 2))}
              />
            </div>
            <div className="space-y-1">
              <Label>Nombre</Label>
              <Input
                value={name}
                className="bg-secondary"
                onChange={(e) => setName(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => {
                onUpdate({ isoCode: iso, name: name.trim() })
                setEditOpen(false)
              }}
            >
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </li>
  )
}

function RegionLine({
  row,
  countryIso,
  disabled,
  onUpdate,
  onDelete,
}: {
  row: GeoRegionRow
  countryIso: string
  disabled: boolean
  onUpdate: (patch: {
    code?: string
    name?: string
    isActive?: boolean
  }) => void
  onDelete: () => void
}) {
  const [editOpen, setEditOpen] = useState(false)
  const [name, setName] = useState(row.name)
  const [code, setCode] = useState(row.code)
  useEffect(() => {
    setName(row.name)
    setCode(row.code)
  }, [row.id, row.name, row.code])

  return (
    <li className="flex flex-col gap-2 border-b border-border/40 px-3 py-2.5 text-sm last:border-0 hover:bg-muted/25 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-3">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
        <span className="w-9 shrink-0 font-mono text-[11px] uppercase text-muted-foreground">
          {countryIso}
        </span>
        <span className="min-w-0 flex-1 font-medium text-foreground">{row.name}</span>
        <code className="rounded bg-muted/50 px-1.5 py-0.5 text-[11px] font-medium">
          {row.code}
        </code>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Activo</span>
          <Switch
            checked={row.is_active}
            disabled={disabled}
            onCheckedChange={(v) => onUpdate({ isActive: v })}
          />
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          disabled={disabled}
          onClick={() => setEditOpen(true)}
        >
          <Pencil className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-destructive"
          disabled={disabled}
          onClick={onDelete}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar región</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label>Código</Label>
              <Input
                value={code}
                className="bg-secondary uppercase"
                onChange={(e) => setCode(e.target.value.toUpperCase())}
              />
            </div>
            <div className="space-y-1">
              <Label>Nombre</Label>
              <Input
                value={name}
                className="bg-secondary"
                onChange={(e) => setName(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => {
                onUpdate({ code: code.trim(), name: name.trim() })
                setEditOpen(false)
              }}
            >
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </li>
  )
}

function CityLine({
  row,
  regionHint,
  showRegionColumn = true,
  disabled,
  bulkSelected,
  onBulkCheckedChange,
  onUpdate,
  onDelete,
}: {
  row: GeoCityRow
  regionHint: string
  showRegionColumn?: boolean
  disabled: boolean
  bulkSelected: boolean
  onBulkCheckedChange: (checked: boolean) => void
  onUpdate: (patch: {
    name?: string
    slug?: string
    isActive?: boolean
  }) => void
  onDelete: () => void
}) {
  const [editOpen, setEditOpen] = useState(false)
  const [name, setName] = useState(row.name)
  const [slug, setSlug] = useState(row.slug)
  useEffect(() => {
    setName(row.name)
    setSlug(row.slug)
  }, [row.id, row.name, row.slug])

  return (
    <li
      className={cn(
        'flex flex-col gap-2 px-2 py-2.5 text-sm sm:flex-row sm:flex-wrap sm:items-center sm:gap-2 sm:px-3',
        !row.is_active && 'bg-amber-500/[0.04]'
      )}
    >
      <div
        className="flex shrink-0 items-center pt-0.5"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <Checkbox
          checked={bulkSelected}
          disabled={disabled}
          aria-label={`Seleccionar ${row.name} para activación masiva`}
          onCheckedChange={(v) => {
            if (v === 'indeterminate') return
            onBulkCheckedChange(v === true)
          }}
        />
      </div>
      {showRegionColumn ? (
        <span
          className="max-w-full truncate text-[11px] text-muted-foreground sm:max-w-[min(200px,28vw)]"
          title={regionHint}
        >
          {regionHint}
        </span>
      ) : null}
      <span className="min-w-0 flex-1 font-medium text-foreground">{row.name}</span>
      <code className="max-w-[140px] truncate text-[11px] text-muted-foreground sm:max-w-none">
        {row.slug}
      </code>
      <div className="ml-auto flex flex-wrap items-center gap-2 sm:ml-0">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Activo</span>
          <Switch
            checked={row.is_active}
            disabled={disabled}
            onCheckedChange={(v) => onUpdate({ isActive: v })}
          />
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          disabled={disabled}
          onClick={() => setEditOpen(true)}
        >
          <Pencil className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-destructive"
          disabled={disabled}
          onClick={onDelete}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar ciudad</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label>Nombre</Label>
              <Input
                value={name}
                className="bg-secondary"
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <Label>Slug</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-muted-foreground"
                  onClick={() => setSlug(slugifyGeoPreview(name))}
                >
                  Generar desde nombre
                </Button>
              </div>
              <Input
                value={slug}
                className="bg-secondary font-mono text-sm"
                onChange={(e) => setSlug(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => {
                onUpdate({ name: name.trim(), slug: slug.trim() })
                setEditOpen(false)
              }}
            >
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </li>
  )
}
