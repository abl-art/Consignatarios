import type { PurchaseLine } from '@/lib/gocelular-webhook'
import { serialValido } from '@/lib/imei-excel-parser'

export interface CatalogoGocelular {
  proveedoresActivos: string[]
  deviceSkusActivos: Set<string>
  deviceSkusInactivos: Set<string>
  addonSkus: Set<string>
  addonSkusInactivos: Set<string>
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
  catalogo: CatalogoGocelular,
  // Los serials solo se aceptan con destino andreani_wh (contrato 23/9/2026);
  // sin destino conocido se omite ese chequeo
  destination?: 'andreani_wh' | 'local'
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
      const nImeis = l.imeis?.length ?? 0
      const nSerials = l.serials?.length ?? 0
      if (nImeis > 0 && nSerials > 0) {
        errores.push(`Línea ${ref}: un equipo se identifica por uno solo de IMEIs o números de serie, no ambos`)
      } else if (nImeis === 0 && nSerials === 0) {
        errores.push(`Línea ${ref}: los equipos requieren IMEIs (celulares) o números de serie (tablets)`)
      } else {
        unidades += nImeis + nSerials
        for (const imei of l.imeis ?? []) {
          if (imeisVistos.has(imei)) errores.push(`IMEI duplicado en la compra: ${imei}`)
          imeisVistos.add(imei)
          if (catalogo.imeisExistentes.has(imei)) {
            errores.push(`El IMEI ${imei} ya existe en el inventario de GOcelular — rechazaría la compra completa`)
          }
        }
        for (const serial of l.serials ?? []) {
          if (!serialValido(serial)) {
            errores.push(`Línea ${ref}: el número de serie "${serial}" no cumple el formato del contrato (4-32 caracteres, letras/números/guion, sin espacios)`)
            continue
          }
          if (imeisVistos.has(serial)) errores.push(`Número de serie duplicado en la compra: ${serial}`)
          imeisVistos.add(serial)
          // GOcelular guarda el serial de las tablets en la misma columna imei de inventory_items
          if (catalogo.imeisExistentes.has(serial)) {
            errores.push(`El número de serie ${serial} ya existe en el inventario de GOcelular — rechazaría la compra completa`)
          }
        }
        if (nSerials > 0 && destination === 'local') {
          errores.push(`Línea ${ref}: los números de serie solo se aceptan con destino Andreani (andreani_wh) — GOcelular rechaza serials con destino local`)
        }
        // quantity en una linea device es opcional; si viene tiene que calzar con los identificadores
        if (l.quantity !== undefined && l.quantity !== nImeis + nSerials) {
          errores.push(`Línea ${ref}: quantity (${l.quantity}) no coincide con la cantidad de identificadores (${nImeis + nSerials})`)
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
      if ((l.imeis && l.imeis.length > 0) || (l.serials && l.serials.length > 0)) {
        errores.push(`Línea ${ref}: los accesorios no llevan IMEIs ni números de serie`)
      }
      if (catalogo.addonSkusInactivos.has(l.sku)) {
        errores.push(`El SKU ${l.sku} existe en GOcelular pero está inactivo — rechazaría la compra completa`)
      } else if (!catalogo.addonSkus.has(l.sku)) {
        // Regla nueva de GOcelular (23/9/2026): un addon cuyo SKU es un EQUIPO en su
        // catalogo rebota con 400 identificador_no_corresponde (antes entraba como alias
        // pendiente y la compra quedaba sin lote — caso tablets MULTIPOINT)
        if (catalogo.deviceSkusActivos.has(l.sku) || catalogo.deviceSkusInactivos.has(l.sku)) {
          errores.push(`El SKU ${l.sku} es un equipo en el catálogo de GOcelular — mandalo como device con IMEIs (celular) o números de serie (tablet), no como accesorio`)
        } else {
          warnings.push(`El SKU ${l.sku} no está en el catálogo de accesorios de GOcelular — quedará como alias pendiente (lo resuelven ellos, no bloquea)`)
        }
      }
    }

    if (l.unit_cost !== undefined) {
      if (!MONTO_RE.test(l.unit_cost)) {
        errores.push(`Línea ${ref}: el costo "${l.unit_cost}" no tiene el formato requerido (decimal con punto, ej. 185000.00)`)
      } else {
        const costo = parseFloat(l.unit_cost)
        const cant = Math.max(0, l.item_type === 'device' ? (l.imeis?.length ?? 0) + (l.serials?.length ?? 0) : (l.quantity ?? 0))
        // Tope $100M por linea: aplica al unit_cost (interpretacion literal de la doc GOcelular; pendiente confirmar si aplica al total de linea)
        if (costo > 100_000_000) errores.push(`Línea ${ref}: el costo unitario supera el tope de $100.000.000 por línea`)
        montoTotal += costo * cant
      }
    }
  }

  if (unidades > 5000) errores.push(`La compra tiene ${unidades} unidades y el máximo es 5000`)
  if (montoTotal > 500_000_000) errores.push(`El costo total agregado ($${Math.round(montoTotal).toLocaleString('es-AR')}) supera el tope de $500.000.000`)

  return { errores, warnings }
}

// ---------------------------------------------------------------------------
// Dry run contra la tabla de alias de GOcelular (lineamiento de Pedro, 7 sep
// 2026): antes de informar una compra se verifica que las cantidades por
// modelo SEGÚN EL ALIAS (sku → modelo en device_model_skus) coincidan con lo
// que declara el pedido del gestor. Ataja el caso del A07: el Excel traía el
// SKU correcto pero el modelo mal informado por el proveedor, y el alias se
// creó con ese modelo equivocado (64GB aliasado como 128GB).
// ---------------------------------------------------------------------------

import { normalizarModelo } from './inventario-indicadores'

export interface LineaDeviceResumen {
  sku: string
  unidades: number
}

export function verificarAliasVsPedido(
  lineas: LineaDeviceResumen[],
  aliasSkuANombre: Map<string, string>,
  itemsDevice: { productoNombre: string; cantidad: number }[],
): ValidacionResult {
  const errores: string[] = []
  const warnings: string[] = []

  // Unidades por modelo según el ALIAS de GOcelular (solo SKUs ya mapeados)
  const porAlias = new Map<string, { nombre: string; unidades: number; skus: string[] }>()
  const sinAlias: LineaDeviceResumen[] = []
  for (const l of lineas) {
    const nombre = aliasSkuANombre.get(l.sku)
    if (!nombre) {
      sinAlias.push(l)
      continue
    }
    const clave = normalizarModelo(nombre)
    const e = porAlias.get(clave) ?? { nombre, unidades: 0, skus: [] }
    e.unidades += l.unidades
    e.skus.push(l.sku)
    porAlias.set(clave, e)
  }

  // Unidades por modelo según el PEDIDO
  const porPedido = new Map<string, { nombre: string; cantidad: number }>()
  for (const i of itemsDevice) {
    const clave = normalizarModelo(i.productoNombre)
    const e = porPedido.get(clave) ?? { nombre: i.productoNombre, cantidad: 0 }
    e.cantidad += i.cantidad
    porPedido.set(clave, e)
  }

  for (const [clave, alias] of porAlias) {
    const pedido = porPedido.get(clave)
    if (!pedido) {
      errores.push(
        `Según el alias de GOcelular, ${alias.skus.join(', ')} (${alias.unidades} u.) corresponde a ` +
        `"${alias.nombre}", pero el pedido no incluye ese modelo — revisar el alias o el pedido antes de enviar`,
      )
      continue
    }
    if (alias.unidades !== pedido.cantidad) {
      errores.push(
        `"${pedido.nombre}": el Excel trae ${alias.unidades} unidades según el alias de GOcelular ` +
        `(${alias.skus.join(', ')}) pero el pedido declara ${pedido.cantidad}`,
      )
    }
  }

  // Modelos del pedido sin ningún SKU que les corresponda según los alias
  for (const [clave, pedido] of porPedido) {
    if (porAlias.has(clave)) continue
    const msj =
      `El pedido declara "${pedido.nombre}" (${pedido.cantidad} u.) pero ningún SKU del Excel ` +
      `corresponde a ese modelo según los alias de GOcelular`
    if (sinAlias.length > 0) {
      warnings.push(`${msj} — puede ser uno de los SKUs sin alias (${sinAlias.map(s => s.sku).join(', ')}), verificá a mano`)
    } else {
      errores.push(msj)
    }
  }

  // SKUs sin alias: GOcelular va a crear el alias confiando en el modelo que
  // informó el proveedor — exactamente cómo nació el error del A07
  for (const l of sinAlias) {
    warnings.push(
      `El SKU ${l.sku} (${l.unidades} u.) no tiene alias en GOcelular: el alias se va a crear con el ` +
      `modelo que informó el proveedor — verificá a mano que el modelo del archivo sea el correcto antes de que Pedro lo mapee`,
    )
  }

  return { errores, warnings }
}
