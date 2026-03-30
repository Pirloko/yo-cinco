'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, MapPinned, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react'
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

  const postAction = async (json: Record<string, unknown>): Promise<boolean> => {
    setSaving(true)
    try {
      const r = await adminJsonFetch('/api/admin/geo', {
        method: 'POST',
        json,
      })
      const j = (await r.json()) as { error?: string; ok?: boolean }
      if (!r.ok) throw new Error(j.error ?? 'Error')
      toast.success('Guardado')
      await load()
      return true
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error')
      return false
    } finally {
      setSaving(false)
    }
  }

  const regionLabel = (r: GeoRegionRow) => {
    const c = countries.find((x) => x.id === r.country_id)
    return `${c?.name ?? '?'} — ${r.name} (${r.code})`
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

            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground">Ciudades</h3>
              <div className="flex flex-wrap gap-2 items-end">
                <div className="space-y-1 min-w-[220px] flex-1">
                  <Label className="text-xs">Región</Label>
                  <Select
                    value={newCity.regionId}
                    onValueChange={(v) => setNewCity((s) => ({ ...s, regionId: v }))}
                  >
                    <SelectTrigger className="h-9 w-full bg-secondary">
                      <SelectValue placeholder="Región" />
                    </SelectTrigger>
                    <SelectContent>
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
              <ul className="divide-y divide-border rounded-md border border-border">
                {cities.map((ci) => {
                  const reg = regions.find((r) => r.id === ci.region_id)
                  return (
                  <CityLine
                    key={ci.id}
                    row={ci}
                    regionHint={reg ? regionLabel(reg) : ci.region_id}
                    disabled={saving}
                    onUpdate={(patch) =>
                      void postAction({ action: 'updateCity', id: ci.id, ...patch })
                    }
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
  onUpdate,
  onDelete,
}: {
  row: GeoCityRow
  regionHint: string
  disabled: boolean
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
    <li className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
      <span
        className="text-xs text-muted-foreground truncate max-w-[200px]"
        title={regionHint}
      >
        {regionHint}
      </span>
      <span className="font-medium text-foreground flex-1 min-w-[100px]">
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
