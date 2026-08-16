// Evaluacion del ingreso al stock de Andreani de un pedido informado a GOcelular.
// Los conteos vienen de la DB externa: IMEIs del intake presentes en inventory_items
// (celulares) y received_quantity vs quantity en inventory_intake_addon_items (accesorios).

export interface IngresoCounts {
  imeisTotales: number
  imeisIngresados: number
  addonsTotales: number
  addonsIngresados: number
}

export interface IngresoEval {
  completo: boolean
  unidadesIngresadas: number
  unidadesTotales: number
}

export function evaluarIngreso(c: IngresoCounts): IngresoEval {
  const unidadesTotales = c.imeisTotales + c.addonsTotales
  const unidadesIngresadas = Math.min(c.imeisIngresados, c.imeisTotales) + Math.min(c.addonsIngresados, c.addonsTotales)
  return {
    // Sin unidades conocidas (el intake no aparecio en GOcelular) nunca se marca completo
    completo: unidadesTotales > 0 && unidadesIngresadas >= unidadesTotales,
    unidadesIngresadas,
    unidadesTotales,
  }
}

export interface PedidoSyncFields {
  entregadoAt?: string
  ingresoStockAt?: string
  gocelular?: {
    estado?: string
    ingresoDetectadoAt?: string
    unidadesIngresadas?: number
    unidadesTotales?: number
  }
}

// Un pedido informado se sigue chequeando hasta que el sync confirme el ingreso real
// (ingresoDetectadoAt). Antes el corte era `!ingresoStockAt`, asi que un pedido marcado
// a mano quedaba fuera del sync para siempre: nunca se le seteaba entregadoAt y figuraba
// como ingresado y en transito al mismo tiempo.
export function necesitaSyncIngreso(p: PedidoSyncFields): boolean {
  return p.gocelular?.estado === 'informado' && !p.gocelular.ingresoDetectadoAt
}

// Ingreso marcado a mano que el deposito todavia no respalda: el pedido dice "stock
// ingresado" pero GOcelular reporta menos unidades fuera de transito de las pedidas.
export function ingresoSinRespaldo(p: PedidoSyncFields): boolean {
  if (!p.ingresoStockAt || !necesitaSyncIngreso(p)) return false
  const totales = p.gocelular?.unidadesTotales ?? 0
  if (totales === 0) return false
  return (p.gocelular?.unidadesIngresadas ?? 0) < totales
}
