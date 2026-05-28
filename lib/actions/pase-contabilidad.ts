'use server'

import { createAdminClient } from '@/lib/supabase/admin'

export interface LineaReporte {
  categoria: string
  stockFinal: number | null
  valuacion: number | null
  estado: 'ok' | 'pendiente' | 'sin_datos'
  nota: string | null
}

export interface ReporteContabilidad {
  periodo: string
  lineas: LineaReporte[]
  totalStock: number
  totalValuacion: number
  completo: boolean
}

export async function fetchPeriodosDisponibles(): Promise<string[]> {
  const sb = createAdminClient()

  const { data: cierres } = await sb
    .from('stock_cierre_mensual')
    .select('periodo')
    .order('periodo', { ascending: false })

  const { data: auditorias } = await sb
    .from('auditorias_stock_propio')
    .select('fecha_corte')

  const periodos = new Set<string>()
  for (const c of cierres ?? []) periodos.add(c.periodo)
  for (const a of auditorias ?? []) {
    if (a.fecha_corte) periodos.add(a.fecha_corte.slice(0, 7))
  }

  return Array.from(periodos).sort().reverse()
}

export async function fetchReporteContabilidad(periodo: string): Promise<ReporteContabilidad> {
  const sb = createAdminClient()

  const { data: cierres } = await sb
    .from('stock_cierre_mensual')
    .select('categoria, stock_final, valuacion')
    .eq('periodo', periodo)

  const cierreMap = new Map<string, { stock_final: number; valuacion: number }>()
  for (const c of cierres ?? []) {
    cierreMap.set(c.categoria, { stock_final: c.stock_final, valuacion: c.valuacion })
  }

  const [anio, mes] = periodo.split('-').map(Number)
  const ultimoDia = new Date(anio, mes, 0).toISOString().slice(0, 10)

  const { data: auditoria } = await sb
    .from('auditorias_stock_propio')
    .select('estado, total_real, valor_existencia_final')
    .eq('fecha_corte', ultimoDia)
    .single()

  const lineas: LineaReporte[] = []

  if (!auditoria) {
    lineas.push({ categoria: 'Celulares', stockFinal: null, valuacion: null, estado: 'sin_datos', nota: 'Sin auditoría para este período' })
  } else if (auditoria.estado !== 'firmada') {
    lineas.push({ categoria: 'Celulares', stockFinal: null, valuacion: null, estado: 'pendiente', nota: `Auditoría en estado: ${auditoria.estado}` })
  } else {
    lineas.push({ categoria: 'Celulares', stockFinal: Number(auditoria.total_real), valuacion: Number(auditoria.valor_existencia_final), estado: 'ok', nota: null })
  }

  const accesorios: { key: string; label: string }[] = [
    { key: 'smartwatches', label: 'Smartwatches' },
    { key: 'parlantes', label: 'Parlantes' },
    { key: 'auriculares', label: 'Auriculares' },
    { key: 'kits-seguridad', label: 'Kits de Seguridad' },
  ]

  for (const acc of accesorios) {
    const cierre = cierreMap.get(acc.key)
    if (cierre) {
      lineas.push({ categoria: acc.label, stockFinal: cierre.stock_final, valuacion: cierre.valuacion, estado: 'ok', nota: null })
    } else {
      lineas.push({ categoria: acc.label, stockFinal: null, valuacion: null, estado: 'sin_datos', nota: 'Sin cierre para este período' })
    }
  }

  const completo = lineas.every(l => l.estado === 'ok')
  const totalStock = lineas.reduce((s, l) => s + (l.stockFinal ?? 0), 0)
  const totalValuacion = lineas.reduce((s, l) => s + (l.valuacion ?? 0), 0)

  return { periodo, lineas, totalStock, totalValuacion, completo }
}
