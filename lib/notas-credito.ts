// Pestaña Notas de crédito de /canales/lista-precios: agrupa las campañas de
// bono en las NC reales que emite cada marca. Una NC = una marca + una
// vigencia (una "acción comercial": los 6 bonos de Motorola de la misma
// vigencia vienen en una única NC de Newsan). Cada acción sabe qué meses toca
// su vigencia para poder filtrar por mes en la UI.

import { normalizarModelo } from './inventario-indicadores'
import { normalizarMarca } from './marca'
import type { FilaHistorialBono, VentaPropiaDiaria } from './lista-precios'

// La NC del bono la emite el proveedor preferido de la marca (el que factura
// los equipos). Estas 4 marcas se muestran siempre en el resumen por marca.
export const PROVEEDOR_NC: Record<string, string> = {
  Motorola: 'Newsan',
  Xiaomi: 'Solnik',
  Nubia: 'Relojería Fueguina',
  Samsung: 'IATEC (Mirgor)',
}

export function marcaNC(nombreModelo: string): string {
  return normalizarMarca(nombreModelo.split(/\s+/)[0] ?? null) ?? '—'
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
  marca: string
  proveedor: string
  desde?: string
  hasta?: string
  meses: string[] // 'yyyy-mm' que toca la vigencia (para el filtro por mes)
  campanias: CampaniaNC[]
  unidades: number // reconocidas del grupo
  ncTotal: number
  enCurso: boolean // alguna campaña vigente o futura: el monto puede seguir creciendo
  emitida: boolean // todas las campañas con la NC emitida
}

// Meses calendario que cubre la vigencia, inclusive (26/8 → 1/9 toca agosto y
// septiembre). Sin hasta, el mes del inicio.
function mesesDeVigencia(desde?: string, hasta?: string): string[] {
  if (!desde) return hasta ? [hasta.slice(0, 7)] : []
  const fin = (hasta ?? desde).slice(0, 7)
  const meses: string[] = []
  let [y, m] = desde.slice(0, 7).split('-').map(Number)
  for (let i = 0; i < 24; i++) {
    const mes = `${y}-${String(m).padStart(2, '0')}`
    meses.push(mes)
    if (mes >= fin) break
    m += 1
    if (m > 12) { m = 1; y += 1 }
  }
  return meses
}

export interface FilaVentasAccion {
  modelo: string
  vendidas: number
  cupo: number | null
  utilizacion: number | null // vendidas ÷ cupo (0.5 = 50%); null sin cupo, puede superar 1
  ncBruta: number // bono × vendidas, cortada en el cupo (la marca no reconoce de más)
}

/**
 * Detalle por modelo para el PDF de una acción: cantidad vendida en la
 * vigencia, cupo, % de utilización y NC bruta = bono por unidad (c/IVA) ×
 * vendidas, con tope en el cupo.
 */
export function resumenVentasAccion(
  campanias: { nombreModelo: string; monto: number; cupo?: number }[],
  ventasPropias: VentaPropiaDiaria[],
  desde?: string,
  hasta?: string,
): FilaVentasAccion[] {
  return campanias.map(c => {
    const clave = normalizarModelo(c.nombreModelo)
    let vendidas = 0
    for (const v of ventasPropias) {
      if (normalizarModelo(v.modelo) !== clave) continue
      if (desde && v.fecha < desde) continue
      if (hasta && v.fecha > hasta) continue
      vendidas += v.ventas
    }
    const cupo = c.cupo && c.cupo > 0 ? c.cupo : null
    return {
      modelo: c.nombreModelo,
      vendidas,
      cupo,
      utilizacion: cupo ? vendidas / cupo : null,
      ncBruta: c.monto * (cupo ? Math.min(vendidas, cupo) : vendidas),
    }
  })
}

export function armarNotasCredito(bonos: FilaHistorialBono[]): GrupoNC[] {
  const grupos = new Map<string, GrupoNC>()

  for (const b of bonos) {
    const marca = marcaNC(b.nombreModelo)
    const key = `${marca}|${b.desde ?? ''}|${b.hasta ?? 'sin-vto'}`
    let g = grupos.get(key)
    if (!g) {
      g = {
        key,
        marca,
        proveedor: PROVEEDOR_NC[marca] ?? marca,
        desde: b.desde,
        hasta: b.hasta,
        meses: mesesDeVigencia(b.desde, b.hasta),
        campanias: [],
        unidades: 0,
        ncTotal: 0,
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
  }

  return [...grupos.values()].sort(
    (a, b) => (b.desde ?? '').localeCompare(a.desde ?? '') || a.marca.localeCompare(b.marca),
  )
}
