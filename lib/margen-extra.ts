// Pestaña Margen extra de /canales/lista-precios: cuánto del bono sell-out se
// queda GOcelular (monto − traslado, neto de IVA) devengado por MES DE VENTA
// de cada unidad — es lo que impacta el resultado del ejercicio mes a mes, no
// el mes de la campaña. Con cupo, solo devengan las primeras `cupo` unidades
// vendidas en orden cronológico (las que exceden no tienen NC de la marca).

import { normalizarModelo } from './inventario-indicadores'
import { marcaNC } from './notas-credito'
import type { FilaHistorialBono, VentaPropiaDiaria } from './lista-precios'

export interface DevengoMensual {
  bonoId: string
  nombreModelo: string
  marca: string
  desde?: string
  hasta?: string
  estado: FilaHistorialBono['estado']
  mes: string // 'yyyy-mm' de la venta
  unidades: number // devengadas en el mes (ya recortadas al cupo)
  margenUnitario: number // (monto − traslado) ÷ 1,21
  margenTotal: number
}

/**
 * Una fila por bono × mes con margen extra devengado. Bonos que trasladan
 * todo el bono al precio (margen 0) quedan afuera. Orden: bono según llega,
 * meses cronológicos dentro de cada bono.
 */
export function armarMargenExtraMensual(
  bonos: FilaHistorialBono[],
  ventasPropias: VentaPropiaDiaria[],
): DevengoMensual[] {
  const filas: DevengoMensual[] = []

  for (const b of bonos) {
    if (!b.margenExtraUnitario || b.margenExtraUnitario <= 0) continue
    const clave = normalizarModelo(b.nombreModelo)
    const enVigencia = ventasPropias
      .filter(v => normalizarModelo(v.modelo) === clave)
      .filter(v => (!b.desde || v.fecha >= b.desde) && (!b.hasta || v.fecha <= b.hasta))
      .sort((a, x) => a.fecha.localeCompare(x.fecha))

    const porMes = new Map<string, number>()
    let restante = b.cupo && b.cupo > 0 ? b.cupo : Infinity
    for (const v of enVigencia) {
      if (restante <= 0) break
      const devengadas = Math.min(v.ventas, restante)
      restante -= devengadas
      const mes = v.fecha.slice(0, 7)
      porMes.set(mes, (porMes.get(mes) ?? 0) + devengadas)
    }

    for (const [mes, unidades] of [...porMes.entries()].sort((a, x) => a[0].localeCompare(x[0]))) {
      filas.push({
        bonoId: b.id,
        nombreModelo: b.nombreModelo,
        marca: marcaNC(b.nombreModelo),
        desde: b.desde,
        hasta: b.hasta,
        estado: b.estado,
        mes,
        unidades,
        margenUnitario: b.margenExtraUnitario,
        margenTotal: unidades * b.margenExtraUnitario,
      })
    }
  }

  return filas
}
