'use server'

import { createAdminClient } from '@/lib/supabase/admin'

// Lectura de los cortes del control de stock Andreani vs GOcelular para la
// solapa Control Stock. La UI trabaja SOLO con cortes guardados (4 por día,
// a los :50 de cada corrida del job de Pedro) — nunca calcula en vivo.

export interface CorteDetalleFila {
  sku: string
  nombre: string
  and_total: number
  and_disponible: number
  go_andreani: number
  go_enviados: number
  go_local: number
  go_transito: number
  dif: number
  medido: boolean
  error: string | null
}

export interface CorteControlStock {
  id: string
  runAt: string
  corteAt: string
  enCola: { nombre: string; unidades: number }[]
  /** Unidades recibidas en el WH en las 48h previas al corte, por modelo (contexto putaway) */
  recepciones: { nombre: string; unidades: number }[]
  /** Despachos sin IMEI conocidos (fantasmas) por modelo — mismos para todos los
   * cortes (estado actual de control_stock_ajustes vigentes); la vista los resta
   * de la dif al descomponer */
  fantasmas: { nombre: string; unidades: number }[]
  filas: CorteDetalleFila[]
}

const PAGINA = 1000

/** Últimos cortes con su detalle, más reciente primero. */
export async function getCortesControlStock(maxCortes = 28): Promise<CorteControlStock[]> {
  const supabase = createAdminClient()
  const { data: cortes } = await supabase
    .from('control_stock_cortes')
    .select('id, run_at, corte_at, en_cola, recepciones')
    .order('run_at', { ascending: false })
    .limit(maxCortes)
  if (!cortes || cortes.length === 0) return []

  const ids = cortes.map(c => c.id as string)
  const detalles: (CorteDetalleFila & { corte_id: string })[] = []
  for (let from = 0; ; from += PAGINA) {
    const { data } = await supabase
      .from('control_stock_cortes_detalle')
      .select('corte_id, sku, nombre, and_total, and_disponible, go_andreani, go_enviados, go_local, go_transito, dif, medido, error')
      .in('corte_id', ids)
      .range(from, from + PAGINA - 1)
    if (!data || data.length === 0) break
    detalles.push(...(data as (CorteDetalleFila & { corte_id: string })[]))
    if (data.length < PAGINA) break
  }

  const porCorte = new Map<string, CorteDetalleFila[]>()
  const skuANombre = new Map<string, string>()
  for (const d of detalles) {
    const arr = porCorte.get(d.corte_id) ?? []
    arr.push(d)
    porCorte.set(d.corte_id, arr)
    if (d.nombre) skuANombre.set(d.sku, d.nombre)
  }

  // Fantasmas conocidos (despachos sin IMEI) por modelo — vigentes, agregados
  // por nombre usando el mapeo sku→modelo de los propios cortes.
  const { data: ajustes } = await supabase
    .from('control_stock_ajustes')
    .select('sku, unidades')
    .eq('vigente', true)
  const fantasmasPorModelo = new Map<string, number>()
  for (const a of (ajustes as { sku: string; unidades: number }[] | null) ?? []) {
    const nombre = skuANombre.get(a.sku) ?? a.sku
    fantasmasPorModelo.set(nombre, (fantasmasPorModelo.get(nombre) ?? 0) + Number(a.unidades))
  }
  const fantasmas = [...fantasmasPorModelo.entries()].map(([nombre, unidades]) => ({ nombre, unidades }))

  return cortes.map(c => ({
    id: c.id as string,
    runAt: new Date(c.run_at as string).toISOString(),
    corteAt: new Date(c.corte_at as string).toISOString(),
    enCola: (c.en_cola as { nombre: string; unidades: number }[] | null) ?? [],
    recepciones: (c.recepciones as { nombre: string; unidades: number }[] | null) ?? [],
    fantasmas,
    filas: (porCorte.get(c.id as string) ?? []).sort(
      (a, b) => Math.abs(b.dif) - Math.abs(a.dif) || (a.nombre ?? '').localeCompare(b.nombre ?? ''),
    ),
  }))
}
