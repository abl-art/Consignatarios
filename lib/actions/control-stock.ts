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
  filas: CorteDetalleFila[]
}

const PAGINA = 1000

/** Últimos cortes con su detalle, más reciente primero. */
export async function getCortesControlStock(maxCortes = 28): Promise<CorteControlStock[]> {
  const supabase = createAdminClient()
  const { data: cortes } = await supabase
    .from('control_stock_cortes')
    .select('id, run_at, corte_at, en_cola')
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
  for (const d of detalles) {
    const arr = porCorte.get(d.corte_id) ?? []
    arr.push(d)
    porCorte.set(d.corte_id, arr)
  }

  return cortes.map(c => ({
    id: c.id as string,
    runAt: new Date(c.run_at as string).toISOString(),
    corteAt: new Date(c.corte_at as string).toISOString(),
    enCola: (c.en_cola as { nombre: string; unidades: number }[] | null) ?? [],
    filas: (porCorte.get(c.id as string) ?? []).sort(
      (a, b) => Math.abs(b.dif) - Math.abs(a.dif) || (a.nombre ?? '').localeCompare(b.nombre ?? ''),
    ),
  }))
}
