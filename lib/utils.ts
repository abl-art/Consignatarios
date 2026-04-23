export function validarIMEI(imei: string): boolean {
  return /^\d{15}$/.test(imei)
}

export function formatearMoneda(monto: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(monto)
}

/**
 * Días entre una fecha (YYYY-MM-DD) y hoy.
 * Devuelve null si fecha es null/inválida.
 */
export function diasDesde(fecha: string | null): number | null {
  if (!fecha) return null
  const f = new Date(fecha + 'T00:00:00')
  if (isNaN(f.getTime())) return null
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  const diff = hoy.getTime() - f.getTime()
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)))
}

/**
 * Clasificación de antigüedad por umbrales:
 * < 30 días: sana (verde)
 * 30-60: atención (amarillo)
 * > 60: stock lento (rojo)
 */
export function clasificarAntiguedad(dias: number | null): {
  label: 'sana' | 'atencion' | 'lenta' | 'nueva'
  textColor: string
  bgColor: string
} {
  if (dias === null) return { label: 'nueva', textColor: 'text-gray-400', bgColor: 'bg-gray-50' }
  if (dias < 30) return { label: 'sana', textColor: 'text-green-700', bgColor: 'bg-green-50' }
  if (dias <= 60) return { label: 'atencion', textColor: 'text-yellow-700', bgColor: 'bg-yellow-50' }
  return { label: 'lenta', textColor: 'text-red-700', bgColor: 'bg-red-50' }
}

export function primerDiaHabil(year: number, month: number): Date {
  const date = new Date(year, month, 1)
  // 0 = domingo, 6 = sábado
  if (date.getDay() === 0) date.setDate(2)
  else if (date.getDay() === 6) date.setDate(3)
  return date
}
