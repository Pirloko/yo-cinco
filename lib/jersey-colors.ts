/** Colores preset para camisetas (hex). El organizador elige uno por equipo. */
export const JERSEY_COLOR_PRESETS = [
  { id: 'blanco', label: 'Blanco', hex: '#f4f4f5' },
  { id: 'negro', label: 'Negro', hex: '#18181b' },
  { id: 'rojo', label: 'Rojo', hex: '#dc2626' },
  { id: 'azul', label: 'Azul', hex: '#2563eb' },
  { id: 'verde', label: 'Verde', hex: '#16a34a' },
  { id: 'amarillo', label: 'Amarillo', hex: '#ca8a04' },
  { id: 'naranja', label: 'Naranja', hex: '#ea580c' },
  { id: 'violeta', label: 'Violeta', hex: '#7c3aed' },
] as const

export function jerseyPresetByHex(hex: string) {
  const n = hex.trim().toLowerCase()
  return JERSEY_COLOR_PRESETS.find((p) => p.hex.toLowerCase() === n)
}
