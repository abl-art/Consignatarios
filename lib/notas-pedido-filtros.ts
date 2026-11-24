// ─── Fecha editable y filtros de las Notas de Pedido del gestor ────────────
// El gestor guarda la fecha como "D/M/YYYY" (es-AR, sin ceros a la izquierda);
// los <input type="date"> hablan ISO. Acá viven las conversiones y el filtro
// por proveedor + rango de fechas (pedido de Emiliano 24/11/2026).

/** "24/11/2026" → "2026-11-24". Fecha rota → "" (el filtro la ignora). */
export function fechaAIso(fecha: string): string {
  const m = fecha.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!m) return ''
  return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
}

/** "2026-11-24" → "24/11/2026" (sin ceros a la izquierda, como guarda el gestor). */
export function isoAFecha(iso: string): string {
  const m = iso.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return ''
  return `${Number(m[3])}/${Number(m[2])}/${m[1]}`
}

export interface FiltrosNotas {
  proveedorId?: string
  /** ISO YYYY-MM-DD, inclusive */
  desde?: string
  hasta?: string
}

export function filtrarNotas<T extends { proveedor: { id: string }; fecha: string }>(
  notas: T[],
  filtros: FiltrosNotas,
): T[] {
  return notas.filter(n => {
    if (filtros.proveedorId && n.proveedor.id !== filtros.proveedorId) return false
    if (filtros.desde || filtros.hasta) {
      const iso = fechaAIso(n.fecha)
      if (!iso) return true // sin fecha parseable no se puede filtrar: se muestra
      if (filtros.desde && iso < filtros.desde) return false
      if (filtros.hasta && iso > filtros.hasta) return false
    }
    return true
  })
}
