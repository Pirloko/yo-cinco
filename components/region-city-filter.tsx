'use client'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { MapPin } from 'lucide-react'

type CityOpt = { id: string; name: string }

/** Solo ciudades con al menos un centro; vacío no renderiza nada. */
export function RegionCityFilterSelect({
  cities,
  value,
  onChange,
  disabled,
  className,
}: {
  cities: CityOpt[]
  value: string
  onChange: (cityId: string) => void
  disabled?: boolean
  className?: string
}) {
  if (cities.length === 0) return null

  return (
    <div className={className}>
      <Select
        value={value ? value : 'all'}
        onValueChange={(v) => onChange(v === 'all' ? '' : v)}
        disabled={disabled}
      >
        <SelectTrigger className="font-brand-heading h-9 w-full sm:max-w-[220px] bg-secondary border-border text-sm text-foreground">
          <MapPin className="w-4 h-4 mr-1 shrink-0 text-muted-foreground" />
          <SelectValue placeholder="Ciudad" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todas las ciudades</SelectItem>
          {cities.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
