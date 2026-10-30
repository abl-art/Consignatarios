// Lógica pura de las líneas disponibles por proveedor (/compras):
// a partir del disponible de hoy y los cheques pendientes, arma el cronograma
// de liberación de saldo — cuánto se libera en cada fecha de pago y cuánto
// queda disponible acumulado después de esa fecha.

export interface ChequePendiente {
  importe: number
  fecha_pago: string // YYYY-MM-DD
}

export interface Liberacion {
  fecha: string
  liberado: number
  acumulado: number
}

export function armarLiberaciones(
  disponibleHoy: number,
  cheques: ChequePendiente[]
): Liberacion[] {
  const porFecha: Record<string, number> = {}
  for (const ch of cheques) {
    porFecha[ch.fecha_pago] = (porFecha[ch.fecha_pago] || 0) + ch.importe
  }

  let acumulado = disponibleHoy
  return Object.keys(porFecha)
    .sort()
    .map(fecha => {
      acumulado += porFecha[fecha]
      return { fecha, liberado: porFecha[fecha], acumulado }
    })
}
