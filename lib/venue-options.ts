/** Canchas disponibles al crear partido (valor guardado = etiqueta mostrada). */
export const VENUE_OPTIONS = [
  'San Damian',
  'Energy',
  'San Lorenzo Rancagua',
  'New Clarence',
  'El Tunga',
  'Santa Helena',
  'Futball 7 (canchas del ollo)',
] as const

export type VenueOption = (typeof VENUE_OPTIONS)[number]
