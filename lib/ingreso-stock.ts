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
