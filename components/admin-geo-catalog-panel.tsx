'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  ChevronDown,
  Loader2,
  MapPinned,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from 'lucide-react'
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
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client'

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
    const supabase = createClient()
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (session?.access_token) {
      headers.Authorization = `Bearer ${session.access_token}`
    }
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
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground">Países</h3>
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
              <ul className="divide-y divide-border rounded-md border border-border">
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
            </section>

            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground">Regiones</h3>
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
              <ul className="divide-y divide-border rounded-md border border-border">
                {regions.map((r) => (
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
            </section>

            <section className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <div className="min-w-0 space-y-1">
                  <h3 className="text-sm font-semibold text-foreground">Ciudades</h3>
                  <p className="text-xs text-muted-foreground">
                    Búsqueda y filtros abajo. Casillas en cada fila; botón para activar las marcadas.
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  className="h-9 w-full shrink-0 sm:w-auto"
                  disabled={saving || selectedCityIds.size === 0}
                  onClick={() => void bulkActivateSelected()}
                >
                  {selectedCityIds.size === 0
                    ? 'Activar ciudad(es) marcadas'
                    : selectedCityIds.size === 1
                      ? 'Activar 1 marcada'
                      : `Activar ${selectedCityIds.size} marcadas`}
                </Button>
              </div>

              <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-3 sm:p-4">
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

              <div className="flex flex-wrap gap-2 items-end">
                <div className="space-y-1 min-w-[220px] flex-1">
                  <Label className="text-xs">Nueva ciudad — Región</Label>
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
                <div className="space-y-1 flex-1 min-w-[120px]">
                  <Label className="text-xs">Nombre</Label>
                  <Input
                    className="h-9 bg-secondary"
                    value={newCity.name}
                    onChange={(e) =>
                      setNewCity((s) => ({ ...s, name: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1 w-28">
                  <Label className="text-xs">Slug (opc.)</Label>
                  <Input
                    className="h-9 bg-secondary"
                    placeholder="auto"
                    value={newCity.slug}
                    onChange={(e) =>
                      setNewCity((s) => ({ ...s, slug: e.target.value }))
                    }
                  />
                </div>
                <Button
                  type="button"
                  size="sm"
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

              {filteredCities.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                  No hay ciudades con estos filtros. Prueba otra búsqueda o quita &quot;Solo
                  inactivas&quot;.
                </p>
              ) : useGroupedCityList ? (
                <div className="max-h-[min(70dvh,640px)] space-y-2 overflow-y-auto pr-1 [scrollbar-width:thin]">
                  {citiesByRegion.map(({ regionId, region, cities: groupCities }) => {
                    const inactiveInGroup = groupCities.filter((c) => !c.is_active).length
                    return (
                      <Collapsible
                        key={regionId}
                        defaultOpen={inactiveInGroup > 0 && citiesInactiveOnly}
                        className="group rounded-lg border border-border bg-card data-[state=open]:shadow-sm"
                      >
                        <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm hover:bg-muted/50">
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
                          <ul className="divide-y divide-border border-t border-border">
                            {groupCities.map((ci) => {
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
                        </CollapsibleContent>
                      </Collapsible>
                    )
                  })}
                </div>
              ) : (
                <ul className="max-h-[min(70dvh,640px)] divide-y divide-border overflow-y-auto rounded-md border border-border [scrollbar-width:thin]">
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
            </section>
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
    <li className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
      <span className="font-medium text-foreground flex-1 min-w-[120px]">
        {row.name}
      </span>
      <code className="text-xs text-muted-foreground">{row.iso_code}</code>
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
    <li className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
      <span className="text-muted-foreground text-xs w-16">{countryIso}</span>
      <span className="font-medium text-foreground flex-1 min-w-[140px]">
        {row.name}
      </span>
      <code className="text-xs">{row.code}</code>
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
  disabled,
  bulkSelected,
  onBulkCheckedChange,
  onUpdate,
  onDelete,
}: {
  row: GeoCityRow
  regionHint: string
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
    <li className="flex flex-wrap items-center gap-2 px-2 py-2 text-sm sm:gap-3 sm:px-3">
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
      <span
        className="max-w-[min(200px,40vw)] truncate text-xs text-muted-foreground"
        title={regionHint}
      >
        {regionHint}
      </span>
      <span className="min-w-0 flex-1 font-medium text-foreground sm:min-w-[100px]">
        {row.name}
      </span>
      <code className="text-xs text-muted-foreground">{row.slug}</code>
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
              <Label>Slug</Label>
              <Input
                value={slug}
                className="bg-secondary"
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
