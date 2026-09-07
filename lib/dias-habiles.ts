// Helpers de días hábiles para el flujo de fondos: GOcuotas no paga nada en
// fin de semana, así que los egresos que caen sábado o domingo se imputan al
// día hábil inmediato siguiente. Fechas siempre en ISO yyyy-mm-dd (sin TZ).

function dow(iso: string): number {
  return new Date(iso + 'T00:00:00Z').getUTCDay()
}

export function esFinde(iso: string): boolean {
  const d = dow(iso)
  return d === 0 || d === 6
}

function sumarDias(iso: string, dias: number): string {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

/** Sábado → lunes, domingo → lunes; un día hábil queda igual. */
export function aDiaHabilSiguiente(iso: string): string {
  const d = dow(iso)
  if (d === 6) return sumarDias(iso, 2)
  if (d === 0) return sumarDias(iso, 1)
  return iso
}

const LETRAS = ['D', 'L', 'M', 'M', 'J', 'V', 'S']

/** Primera letra del día de la semana: L M M J V S D. */
export function letraDia(iso: string): string {
  return LETRAS[dow(iso)]
}
