// Pestaña Notas de crédito de /canales/lista-precios: agrupa las campañas de
// bono en las NC reales que emite cada marca. Una NC = un proveedor + una
// vigencia (los 6 bonos de Motorola de la misma acción vienen en una única NC
// de Newsan). La imputación mensual reparte cada NC por el MES DE VENTA de
// las unidades reconocidas — una campaña que cruza meses (26/8 → 1/9) genera
// NC de agosto por lo vendido en agosto y de septiembre por lo de septiembre,
// respetando el corte cronológico del cupo.

import { normalizarModelo } from './inventario-indicadores'
import { normalizarMarca } from './marca'
import type { FilaHistorialBono, VentaPropiaDiaria } from './lista-precios'

// La NC del bono la emite el proveedor preferido de la marca (el que factura
// los equipos), no importa de quién se haya comprado alguna partida suelta
const PROVEEDOR_NC: Record<string, string> = {
  Motorola: 'Newsan',
  Xiaomi: 'Solnik',
  Nubia: 'Relojería Fueguina',
  Samsung: 'IATEC (Mirgor)',
}

export function proveedorNC(nombreModelo: string): string {
  const marca = normalizarMarca(nombreModelo.split(/\s+/)[0] ?? null) ?? '—'
  return PROVEEDOR_NC[marca] ?? marca
}

export interface CampaniaNC {
  id: string
  nombreModelo: string
  monto: number
  cupo?: number
  reconocidas: number
  ncUnitaria: number
  ncTotal: number
  estado: FilaHistorialBono['estado']
  emitida: boolean
}

export interface GrupoNC {
  key: string
  proveedor: string
  desde?: string
  hasta?: string
  campanias: CampaniaNC[]
  unidades: number // reconocidas del grupo
  ncTotal: number
  ncPorMes: Record<string, number> // 'yyyy-mm' → $ devengado por ventas de ese mes
  enCurso: boolean // alguna campaña vigente o futura: el monto puede seguir creciendo
  emitida: boolean // todas las campañas con la NC emitida
}

export interface MesNC {
  mes: string // 'yyyy-mm'
  total: number
  emitidas: number
  pendientes: number
}

export interface ResumenNC {
  grupos: GrupoNC[]
  totales: { total: number; emitidas: number; pendientes: number }
  meses: MesNC[]
}

// Unidades reconocidas de una campaña repartidas por mes de venta: se recorren
// los días en orden y el cupo corta donde corta — las ventas que llegan tarde
// no generan NC. Si las ventas diarias no alcanzan a explicar las reconocidas
// (datos incompletos), el resto se imputa al mes de cierre de la campaña.
function unidadesPorMes(c: FilaHistorialBono, ventasPropias: VentaPropiaDiaria[]): Record<string, number> {
  const clave = normalizarModelo(c.nombreModelo)
  const dias = ventasPropias
    .filter(v =>
      normalizarModelo(v.modelo) === clave &&
      (!c.desde || v.fecha >= c.desde) &&
      (!c.hasta || v.fecha <= c.hasta),
    )
    .sort((a, b) => a.fecha.localeCompare(b.fecha))

  let restante = c.cupo && c.cupo > 0 ? c.cupo : Infinity
  const meses: Record<string, number> = {}
  let contadas = 0
  for (const d of dias) {
    if (restante <= 0) break
    const u = Math.min(d.ventas, restante)
    const mes = d.fecha.slice(0, 7)
    meses[mes] = (meses[mes] ?? 0) + u
    restante -= u
    contadas += u
  }
  if (contadas < c.reconocidas) {
    const mesCierre = (c.hasta ?? c.desde ?? '').slice(0, 7)
    if (mesCierre) meses[mesCierre] = (meses[mesCierre] ?? 0) + (c.reconocidas - contadas)
  }
  return meses
}

export function armarNotasCredito(bonos: FilaHistorialBono[], ventasPropias: VentaPropiaDiaria[]): ResumenNC {
  const grupos = new Map<string, GrupoNC>()

  for (const b of bonos) {
    const proveedor = proveedorNC(b.nombreModelo)
    const key = `${proveedor}|${b.desde ?? ''}|${b.hasta ?? 'sin-vto'}`
    let g = grupos.get(key)
    if (!g) {
      g = {
        key,
        proveedor,
        desde: b.desde,
        hasta: b.hasta,
        campanias: [],
        unidades: 0,
        ncTotal: 0,
        ncPorMes: {},
        enCurso: false,
        emitida: true,
      }
      grupos.set(key, g)
    }
    const emitida = !!b.ncEmitidaAt
    g.campanias.push({
      id: b.id,
      nombreModelo: b.nombreModelo,
      monto: b.monto,
      cupo: b.cupo,
      reconocidas: b.reconocidas,
      ncUnitaria: b.ncUnitaria,
      ncTotal: b.ncTotal,
      estado: b.estado,
      emitida,
    })
    g.unidades += b.reconocidas
    g.ncTotal += b.ncTotal
    if (b.estado === 'vigente' || b.estado === 'futuro') g.enCurso = true
    if (!emitida) g.emitida = false
    for (const [mes, u] of Object.entries(unidadesPorMes(b, ventasPropias))) {
      g.ncPorMes[mes] = (g.ncPorMes[mes] ?? 0) + u * b.ncUnitaria
    }
  }

  const lista = [...grupos.values()].sort(
    (a, b) => (b.desde ?? '').localeCompare(a.desde ?? '') || a.proveedor.localeCompare(b.proveedor),
  )

  const totales = { total: 0, emitidas: 0, pendientes: 0 }
  const porMes = new Map<string, MesNC>()
  for (const g of lista) {
    totales.total += g.ncTotal
    if (g.emitida) totales.emitidas += g.ncTotal
    else totales.pendientes += g.ncTotal
    for (const [mes, monto] of Object.entries(g.ncPorMes)) {
      let m = porMes.get(mes)
      if (!m) {
        m = { mes, total: 0, emitidas: 0, pendientes: 0 }
        porMes.set(mes, m)
      }
      m.total += monto
      if (g.emitida) m.emitidas += monto
      else m.pendientes += monto
    }
  }

  const meses = [...porMes.values()].sort((a, b) => b.mes.localeCompare(a.mes))
  return { grupos: lista, totales, meses }
}
