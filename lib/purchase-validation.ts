import type { PurchaseLine } from '@/lib/gocelular-webhook'

export interface CatalogoGocelular {
  proveedoresActivos: string[]
  deviceSkusActivos: Set<string>
  deviceSkusInactivos: Set<string>
  addonSkus: Set<string>
  imeisExistentes: Set<string>
}

export interface ValidacionResult {
  errores: string[]
  warnings: string[]
}

const MONTO_RE = /^\d+(\.\d{1,2})?$/

export function validarCompra(
  supplier: string,
  lines: PurchaseLine[],
  catalogo: CatalogoGocelular
): ValidacionResult {
  const errores: string[] = []
  const warnings: string[] = []

  // Proveedor: trim + case-insensitive, exactamente un match activo
  const needle = supplier.trim().toLowerCase()
  const matches = catalogo.proveedoresActivos.filter(p => p.trim().toLowerCase() === needle)
  if (matches.length === 0) {
    errores.push(`El proveedor "${supplier}" no matchea ningún proveedor activo en GOcelular — revisá el nombre exacto en su catálogo`)
  } else if (matches.length > 1) {
    errores.push(`El proveedor "${supplier}" matchea más de un proveedor activo en GOcelular (duplicados en su catálogo) — coordinar limpieza con GOcelular`)
  }

  if (lines.length === 0) errores.push('La compra no tiene líneas')
  if (lines.length > 200) errores.push(`La compra tiene ${lines.length} líneas y el máximo es 200`)

  let unidades = 0
  let montoTotal = 0
  const imeisVistos = new Set<string>()

  for (const l of lines) {
    const ref = l.line_reference

    if (l.item_type === 'device') {
      if (!l.imeis || l.imeis.length === 0) {
        errores.push(`Línea ${ref}: los celulares requieren IMEIs`)
      } else {
        unidades += l.imeis.length
        for (const imei of l.imeis) {
          if (imeisVistos.has(imei)) errores.push(`IMEI duplicado en la compra: ${imei}`)
          imeisVistos.add(imei)
          if (catalogo.imeisExistentes.has(imei)) {
            errores.push(`El IMEI ${imei} ya existe en el inventario de GOcelular — rechazaría la compra completa`)
          }
        }
      }
      if (catalogo.deviceSkusInactivos.has(l.sku)) {
        errores.push(`El SKU ${l.sku} existe en GOcelular pero está inactivo — rechazaría la compra completa`)
      } else if (!catalogo.deviceSkusActivos.has(l.sku)) {
        warnings.push(`El SKU ${l.sku} no está en el catálogo de devices de GOcelular — quedará como alias pendiente (lo resuelven ellos, no bloquea)`)
      }
    } else {
      // addon
      if (!l.quantity || l.quantity <= 0) errores.push(`Línea ${ref}: los accesorios requieren cantidad mayor a 0`)
      else unidades += l.quantity
      if (!l.unit_cost) errores.push(`Línea ${ref}: los accesorios requieren costo unitario`)
      if (l.imeis && l.imeis.length > 0) errores.push(`Línea ${ref}: los accesorios no llevan IMEIs`)
      if (!catalogo.addonSkus.has(l.sku)) {
        warnings.push(`El SKU ${l.sku} no está en el catálogo de accesorios de GOcelular — quedará como alias pendiente (lo resuelven ellos, no bloquea)`)
      }
    }

    if (l.unit_cost !== undefined) {
      if (!MONTO_RE.test(l.unit_cost)) {
        errores.push(`Línea ${ref}: el costo "${l.unit_cost}" no tiene el formato requerido (decimal con punto, ej. 185000.00)`)
      } else {
        const costo = parseFloat(l.unit_cost)
        const cant = l.item_type === 'device' ? (l.imeis?.length ?? 0) : (l.quantity ?? 0)
        if (costo > 100_000_000) errores.push(`Línea ${ref}: el costo unitario supera el tope de $100.000.000 por línea`)
        montoTotal += costo * cant
      }
    }
  }

  if (unidades > 5000) errores.push(`La compra tiene ${unidades} unidades y el máximo es 5000`)
  if (montoTotal > 500_000_000) errores.push(`El costo total agregado ($${Math.round(montoTotal).toLocaleString('es-AR')}) supera el tope de $500.000.000`)

  return { errores, warnings }
}
