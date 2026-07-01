'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getPedidos } from './compras'
import { getMejorPrecio } from './compras'
import { buscarPrecio } from '@/lib/utils'
import { revalidatePath } from 'next/cache'

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

export interface PedidoTransito {
  id: string
  proveedorNombre: string
  categoria: string
  fecha: string
  items: { productoNombre: string; cantidad: number; precioUnit: number; subtotal: number }[]
  unidades: number
  valuacion: number
  seleccionado: boolean
  tipo: 'en_transito' | 'recibido_sin_ingreso'
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
    .select('estado, detalle, valor_existencia_final')
    .eq('fecha_corte', ultimoDia)
    .single()

  const lineas: LineaReporte[] = []

  if (!auditoria) {
    lineas.push({ categoria: 'Celulares', stockFinal: null, valuacion: null, estado: 'sin_datos', nota: 'Sin auditoria para este periodo' })
  } else if (auditoria.estado !== 'firmada') {
    lineas.push({ categoria: 'Celulares', stockFinal: null, valuacion: null, estado: 'pendiente', nota: `Auditoria en estado: ${auditoria.estado}` })
  } else {
    const detalle = typeof auditoria.detalle === 'string' ? JSON.parse(auditoria.detalle) : auditoria.detalle
    const unidades = (detalle as { real: number }[]).reduce((s: number, d: { real: number }) => s + d.real, 0)
    lineas.push({ categoria: 'Celulares', stockFinal: unidades, valuacion: Number(auditoria.valor_existencia_final), estado: 'ok', nota: null })
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
      lineas.push({ categoria: acc.label, stockFinal: null, valuacion: null, estado: 'sin_datos', nota: 'Sin cierre para este periodo' })
    }
  }

  // Agregar lineas de transito facturado
  const { data: transito } = await sb
    .from('pase_contabilidad_transito')
    .select('categoria, unidades, valuacion')
    .eq('periodo', periodo)

  if (transito && transito.length > 0) {
    const transitoPorCat: Record<string, { unidades: number; valuacion: number }> = {}
    for (const t of transito) {
      if (!transitoPorCat[t.categoria]) transitoPorCat[t.categoria] = { unidades: 0, valuacion: 0 }
      transitoPorCat[t.categoria].unidades += t.unidades
      transitoPorCat[t.categoria].valuacion += Number(t.valuacion)
    }
    for (const [cat, vals] of Object.entries(transitoPorCat)) {
      lineas.push({
        categoria: `${cat} - En transito facturados`,
        stockFinal: vals.unidades,
        valuacion: vals.valuacion,
        estado: 'ok',
        nota: null,
      })
    }
  }

  const completo = lineas.every(l => l.estado === 'ok')
  const totalStock = lineas.reduce((s, l) => s + (l.stockFinal ?? 0), 0)
  const totalValuacion = lineas.reduce((s, l) => s + (l.valuacion ?? 0), 0)

  return { periodo, lineas, totalStock, totalValuacion, completo }
}

export async function fetchPedidosEnTransito(periodo: string): Promise<PedidoTransito[]> {
  const [anio, mes] = periodo.split('-').map(Number)
  const ultimoDia = new Date(anio, mes, 0)
  const ultimoDiaStr = ultimoDia.toISOString().slice(0, 10) + 'T23:59:59'

  const pedidos = await getPedidos()
  const precios = await getMejorPrecio()

  const sb = createAdminClient()
  const { data: seleccionados } = await sb
    .from('pase_contabilidad_transito')
    .select('pedido_id')
    .eq('periodo', periodo)
  const idsSeleccionados = new Set((seleccionados ?? []).map(s => s.pedido_id))

  // En tránsito: confirmado antes del cierre, no entregado aún al cierre
  const enTransito = pedidos.filter(p => {
    if (p.estado !== 'enviado') return false
    if (!p.confirmadoAt || p.confirmadoAt > ultimoDiaStr) return false
    if (p.entregadoAt && p.entregadoAt <= ultimoDiaStr) return false
    return true
  })

  // Recibido pero no ingresado al stock: entregado antes del cierre, sin ingreso al stock al cierre
  const recibidosSinIngreso = pedidos.filter(p => {
    if (!p.entregadoAt || p.entregadoAt > ultimoDiaStr) return false
    if (p.ingresoStockAt && p.ingresoStockAt <= ultimoDiaStr) return false
    return true
  })

  function mapPedido(p: typeof pedidos[0], tipo: 'en_transito' | 'recibido_sin_ingreso'): PedidoTransito {
    const items = p.items.map(item => {
      const precioUnit = buscarPrecio(precios, item.productoNombre)
      return {
        productoNombre: item.productoNombre,
        cantidad: item.cantidad,
        precioUnit,
        subtotal: item.cantidad * precioUnit,
      }
    })
    const unidades = items.reduce((s, i) => s + i.cantidad, 0)
    const valuacion = items.reduce((s, i) => s + i.subtotal, 0)
    return {
      id: p.id,
      proveedorNombre: p.proveedorNombre,
      categoria: p.categoria ?? 'Celulares',
      fecha: p.fecha,
      items,
      unidades,
      valuacion,
      seleccionado: idsSeleccionados.has(p.id),
      tipo,
    }
  }

  return [
    ...enTransito.map(p => mapPedido(p, 'en_transito')),
    ...recibidosSinIngreso.map(p => mapPedido(p, 'recibido_sin_ingreso')),
  ]
}

export async function guardarTransitoSeleccion(
  periodo: string,
  pedidos: { id: string; categoria: string; proveedor: string; items: { productoNombre: string; cantidad: number; precioUnit: number; subtotal: number }[]; unidades: number; valuacion: number }[]
): Promise<{ ok: true } | { error: string }> {
  const sb = createAdminClient()

  await sb.from('pase_contabilidad_transito').delete().eq('periodo', periodo)

  if (pedidos.length === 0) {
    revalidatePath('/pase-contabilidad')
    return { ok: true }
  }

  const rows = pedidos.map(p => ({
    periodo,
    pedido_id: p.id,
    categoria: p.categoria,
    proveedor: p.proveedor,
    items: JSON.stringify(p.items),
    unidades: p.unidades,
    valuacion: p.valuacion,
  }))

  const { error } = await sb.from('pase_contabilidad_transito').insert(rows)
  if (error) return { error: error.message }

  revalidatePath('/pase-contabilidad')
  return { ok: true }
}
