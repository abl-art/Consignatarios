// Parseo y conciliación de la factura mensual de warehouse/fulfillment de
// Andreani (Excel "GO CUOTAS", Cte 123734, arranca ago 2026).
//
// El Excel trae una hoja resumen ("Fact. Go Cuotas") con los conceptos
// facturados (IN Bulto, Almacén, Out Unidad, Insumos, Seguro) y hojas de
// detalle de donde sale cada Q: "Out " (una fila por unidad expedida con la
// orden SO-* de la tienda), "IN " (una fila por recepción con remito y
// proveedor) y "Seguro" (inventario diario valorizado; el seguro es 0,2% del
// PICO de valor declarado del mes). Las funciones son puras: reciben las
// matrices de celdas de sheet_to_json(header: 1, raw: true).

export type Celda = string | number | boolean | null | undefined

export interface ConceptoFactura {
  item: string
  detalle: string
  cantidad: number
  precio_unitario: number
  total: number
}

export interface OutFacturado {
  orden: string
  sku: string
  unidades: number
  fechaEnvio: string | null
}

export interface RecepcionFacturada {
  fecha: string | null
  proveedor: string
  remito: string
  pallets: number
  bultos: number
  unidades: number
}

export interface FacturaWarehouseParseada {
  periodo: string // 'YYYY-MM'
  conceptos: ConceptoFactura[]
  totalFacturado: number
  out: OutFacturado[]
  unidadesOut: number
  ordenesOut: number
  ingresos: RecepcionFacturada[]
  bultosIn: number
  unidadesIn: number
  seguroDiario: { fecha: string; valor: number }[]
  valorPicoSeguro: number | null
  fechaPicoSeguro: string | null
  avisos: string[]
}

/** Serial de fecha de Excel (días desde 30/12/1899) → 'YYYY-MM-DD'. */
export function serialAFecha(serial: number): string {
  const d = new Date(Date.UTC(1899, 11, 30) + Math.round(serial) * 86400000)
  return d.toISOString().slice(0, 10)
}

const esNum = (v: Celda): v is number => typeof v === 'number' && Number.isFinite(v)
const esTexto = (v: Celda): v is string => typeof v === 'string' && v.trim().length > 0

function parseResumen(hoja: Celda[][]): { conceptos: ConceptoFactura[]; total: number | null; periodo: string | null } {
  // Encabezado: fila que contiene "Item Facturable"; las filas de concepto
  // tienen item en col 1 y total numérico en col 7. El total general está en
  // la fila con la celda "TOTAL FC" (el total en la celda siguiente).
  const conceptos: ConceptoFactura[] = []
  let total: number | null = null
  let periodo: string | null = null
  let headerVisto = false
  for (const fila of hoja) {
    if (!headerVisto) {
      if (fila.some(c => esTexto(c) && c.trim() === 'Item Facturable')) headerVisto = true
      continue
    }
    const idxTotalFc = fila.findIndex(c => esTexto(c) && c.trim() === 'TOTAL FC')
    if (idxTotalFc >= 0 && esNum(fila[idxTotalFc + 1])) {
      total = fila[idxTotalFc + 1] as number
      continue
    }
    if (esTexto(fila[1]) && esNum(fila[7])) {
      conceptos.push({
        item: fila[1].trim(),
        detalle: esTexto(fila[2]) ? fila[2].trim() : String(fila[2] ?? ''),
        cantidad: esNum(fila[5]) ? fila[5] : 0,
        precio_unitario: esNum(fila[6]) ? fila[6] : 0,
        total: fila[7],
      })
      if (!periodo && esNum(fila[3])) periodo = serialAFecha(fila[3]).slice(0, 7)
    }
  }
  return { conceptos, total, periodo }
}

function parseOut(hoja: Celda[][]): OutFacturado[] {
  // Encabezado por nombre de columna (fila con "Número de orden:")
  const iHeader = hoja.findIndex(f => f.some(c => esTexto(c) && c.trim() === 'Número de orden:'))
  if (iHeader < 0) return []
  const header = hoja[iHeader].map(c => (esTexto(c) ? c.trim() : ''))
  const iOrden = header.indexOf('Orden externa Nº 1:')
  const iSku = header.indexOf('Artículo:')
  const iCtd = header.indexOf('Ctd. expedida:')
  const iFecha = header.indexOf('Fecha de envío:')
  if (iOrden < 0 || iCtd < 0) return []
  const out: OutFacturado[] = []
  for (let i = iHeader + 1; i < hoja.length; i++) {
    const f = hoja[i]
    if (!esTexto(f[iOrden])) continue
    out.push({
      orden: f[iOrden].trim(),
      sku: esTexto(f[iSku]) ? f[iSku].trim() : '',
      unidades: esNum(f[iCtd]) ? f[iCtd] : 0,
      fechaEnvio: esNum(f[iFecha]) ? serialAFecha(f[iFecha]) : null,
    })
  }
  return out
}

function parseIn(hoja: Celda[][]): RecepcionFacturada[] {
  // Encabezado: fila que arranca con "Fecha" y contiene "Remito". "Pallets" y
  // "Bultos" aparecen dos veces (entrada y salida): vale la primera.
  const iHeader = hoja.findIndex(
    f => esTexto(f[0]) && f[0].trim() === 'Fecha' && f.some(c => esTexto(c) && c.trim() === 'Remito'),
  )
  if (iHeader < 0) return []
  const header = hoja[iHeader].map(c => (esTexto(c) ? c.trim() : ''))
  const iComitente = header.indexOf('Comitente')
  const iRemito = header.indexOf('Remito')
  const iPallets = header.indexOf('Pallets')
  const iBultos = header.indexOf('Bultos')
  const iUnidades = header.indexOf('Unidades')
  const ingresos: RecepcionFacturada[] = []
  for (let i = iHeader + 1; i < hoja.length; i++) {
    const f = hoja[i]
    if (!esNum(f[0])) continue
    ingresos.push({
      fecha: serialAFecha(f[0]),
      proveedor: esTexto(f[iComitente]) ? f[iComitente].trim() : '',
      remito: esTexto(f[iRemito]) ? f[iRemito].trim() : String(f[iRemito] ?? ''),
      pallets: esNum(f[iPallets]) ? f[iPallets] : 0,
      bultos: esNum(f[iBultos]) ? f[iBultos] : 0,
      unidades: esNum(f[iUnidades]) ? f[iUnidades] : 0,
    })
  }
  return ingresos
}

function parseSeguro(hoja: Celda[][]): { fecha: string; valor: number }[] {
  // Pivote fecha → valor declarado en las columnas 10/11 (serial + $).
  // Puede venir la celda del pico repetida: se deduplica por fecha con el máximo.
  const porFecha = new Map<string, number>()
  for (const f of hoja) {
    if (esNum(f[10]) && esNum(f[11]) && f[10] > 40000) {
      const fecha = serialAFecha(f[10])
      porFecha.set(fecha, Math.max(porFecha.get(fecha) ?? 0, f[11]))
    }
  }
  return [...porFecha.entries()]
    .map(([fecha, valor]) => ({ fecha, valor }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
}

export function parseFacturaWarehouse(hojas: {
  resumen: Celda[][]
  out: Celda[][]
  ingresos: Celda[][]
  seguro: Celda[][]
}): FacturaWarehouseParseada | { error: string } {
  const { conceptos, total, periodo } = parseResumen(hojas.resumen)
  if (conceptos.length === 0) return { error: 'No se encontraron conceptos en la hoja resumen (falta "Item Facturable")' }
  if (total === null) return { error: 'No se encontró la fila TOTAL FC en la hoja resumen' }
  if (!periodo) return { error: 'No se pudo determinar el período (columna MES/AÑO REAL)' }

  const out = parseOut(hojas.out)
  const ingresos = parseIn(hojas.ingresos)
  const seguroDiario = parseSeguro(hojas.seguro)

  const unidadesOut = out.reduce((s, r) => s + r.unidades, 0)
  const ordenesOut = new Set(out.map(r => r.orden)).size
  const bultosIn = ingresos.reduce((s, r) => s + r.bultos, 0)
  const unidadesIn = ingresos.reduce((s, r) => s + r.unidades, 0)
  const pico = seguroDiario.reduce<{ fecha: string; valor: number } | null>(
    (m, p) => (m === null || p.valor > m.valor ? p : m),
    null,
  )

  // Chequeos cruzados resumen vs detalle: discrepancia = aviso, no bloquea
  const avisos: string[] = []
  const sumaConceptos = conceptos.reduce((s, c) => s + c.total, 0)
  if (Math.abs(sumaConceptos - total) > 1) {
    avisos.push(`La suma de conceptos ($${Math.round(sumaConceptos).toLocaleString('es-AR')}) no coincide con el TOTAL FC ($${Math.round(total).toLocaleString('es-AR')})`)
  }
  const chequeoQ = (patron: RegExp, real: number, etiqueta: string) => {
    const c = conceptos.find(x => patron.test(x.item))
    if (c && Math.abs(c.cantidad - real) > 0.5) {
      avisos.push(`${etiqueta}: la factura cobra ${c.cantidad.toLocaleString('es-AR')} pero el detalle suma ${real.toLocaleString('es-AR')}`)
    }
  }
  chequeoQ(/^OUT\b/i, unidadesOut, 'Unidades OUT')
  chequeoQ(/^IN\b/i, bultosIn, 'Bultos IN') // \b para no matchear INSUMOS
  if (pico) chequeoQ(/^SEGURO/i, pico.valor, 'Valor declarado del seguro')

  return {
    periodo,
    conceptos,
    totalFacturado: total,
    out,
    unidadesOut,
    ordenesOut,
    ingresos,
    bultosIn,
    unidadesIn,
    seguroDiario,
    valorPicoSeguro: pico?.valor ?? null,
    fechaPicoSeguro: pico?.fecha ?? null,
    avisos,
  }
}

// ── Conciliación contra GOcelular ──────────────────────────────────────────

export interface OutConciliado extends OutFacturado {
  estado: 'conciliado' | 'revisar'
  motivo: string | null
}

/**
 * Concilia las líneas OUT facturadas contra el estado real en GOcelular:
 * conciliado = la orden existe y fue expedida por el warehouse; cualquier otra
 * cosa (no existe, sin pedido de WH, otro estado) queda para revisar con el
 * estado real como motivo. Los conteos son por ORDEN (como factura Andreani
 * la preparación es por unidad, pero el reclamo se hace por orden).
 */
export function conciliarOutWarehouse(
  out: OutFacturado[],
  estadoPorOrden: Map<string, string>,
): { filas: OutConciliado[]; conciliadas: number; revisar: number } {
  const filas: OutConciliado[] = out.map(r => {
    const estado = estadoPorOrden.get(r.orden)
    if (estado === 'expedido') return { ...r, estado: 'conciliado', motivo: null }
    return { ...r, estado: 'revisar', motivo: estado ?? 'no_existe' }
  })
  const ordenes = new Map<string, 'conciliado' | 'revisar'>()
  for (const f of filas) {
    if (ordenes.get(f.orden) !== 'revisar') ordenes.set(f.orden, f.estado)
  }
  let conciliadas = 0
  let revisar = 0
  for (const e of ordenes.values()) e === 'conciliado' ? conciliadas++ : revisar++
  return { filas, conciliadas, revisar }
}

// ── Control del OUT por pedidos ────────────────────────────────────────────

export interface ControlOut {
  precioUnitario: number
  pedidosGocelular: number
  outFacturado: number
  outCorrecto: number
  /** OUT facturado − OUT correcto. Positivo = Andreani cobró de más. */
  sobrefacturado: number
  totalCorrecto: number
}

/**
 * Regla de Emiliano (15 sep 2026): la preparación (OUT) se cobra por PEDIDO
 * expedido, no por artículo — el precio unitario está bien pero Andreani
 * factura Q = artículos. El costo correcto se recalcula con la cantidad de
 * pedidos expedidos según la BASE DE GOCELULAR en el período (no el detalle
 * de Andreani). Devuelve null si no hay concepto OUT o no hay dato de pedidos.
 */
export function controlOutPedidos(
  conceptos: ConceptoFactura[],
  totalFacturado: number,
  pedidosGocelular: number,
): ControlOut | null {
  if (pedidosGocelular <= 0) return null
  const outs = conceptos.filter(c => /^OUT\b/i.test(c.item))
  if (outs.length === 0) return null
  const outFacturado = outs.reduce((s, c) => s + c.total, 0)
  const precioUnitario = outs[0].precio_unitario
  const outCorrecto = precioUnitario * pedidosGocelular
  const sobrefacturado = outFacturado - outCorrecto
  return {
    precioUnitario,
    pedidosGocelular,
    outFacturado,
    outCorrecto,
    sobrefacturado,
    totalCorrecto: totalFacturado - sobrefacturado,
  }
}

// ── Desglose por tarjeta de la solapa Costos ───────────────────────────────

export type BucketWarehouse = 'in' | 'almacen' | 'out' | 'insumos' | 'seguro' | 'otros'

export const BUCKETS_WAREHOUSE: { key: BucketWarehouse; label: string }[] = [
  { key: 'in', label: 'IN (Recepción)' },
  { key: 'almacen', label: 'Almacenamiento' },
  { key: 'out', label: 'Preparado OUT' },
  { key: 'insumos', label: 'Materiales de envoltura' },
  { key: 'seguro', label: 'Seguro Warehouse' },
  { key: 'otros', label: 'Otros' },
]

/** Agrupa los conceptos de la factura en las tarjetas de la solapa Costos. */
export function desgloseWarehouse(conceptos: ConceptoFactura[]): Record<BucketWarehouse, number> {
  const r: Record<BucketWarehouse, number> = { in: 0, almacen: 0, out: 0, insumos: 0, seguro: 0, otros: 0 }
  for (const c of conceptos) {
    const item = c.item.toUpperCase()
    // INSUMOS antes que IN: ambos empiezan con "IN"
    if (item.startsWith('INSUMO')) r.insumos += c.total
    else if (item.startsWith('IN')) r.in += c.total
    else if (item.startsWith('ALMACEN') || item.startsWith('ALMACÉN')) r.almacen += c.total
    else if (item.startsWith('OUT')) r.out += c.total
    else if (item.startsWith('SEGURO')) r.seguro += c.total
    else r.otros += c.total
  }
  return r
}
