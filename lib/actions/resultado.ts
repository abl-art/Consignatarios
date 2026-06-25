'use server'

import { getPool } from '@/lib/db-pool'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ConfigResultado {
  kit_seguridad: number
  envio_fulfillment: number
  licencias_bloqueo: number
  sueldos: number
  otros: number
  adquirencia: number    // % sobre venta neta
  incobrables: number    // % sobre venta neta
  iibb: number           // % ingresos brutos
  com_e_ind: number      // % comercio e industria
  tna: number            // % tasa nominal anual
  plazo_pago_proveedor: number  // días
  tipo_cambio: number    // ARS/USD
}

export interface ProductoResultado {
  nombre: string
  kind: 'main' | 'addon'
  unidades: number
  precio_venta_neto: number     // promedio sin IVA
  costo: number                 // min proveedor
  multiplo: number              // precio/costo
  kit: number
  envio: number
  contribucion_bruta: number
  adquirencia: number
  incobrables: number
  licencias_bloqueo: number
  sueldos: number
  otros_costo: number
  intereses: number
  impuestos: number
  contribucion_neta: number
  rentabilidad_costo: number    // %
  rentabilidad_venta: number    // %
  ganancia: number              // neta × unidades
  ganancia_usd: number
}

export interface ResultadoData {
  productos: ProductoResultado[]
  config: ConfigResultado
  totals: {
    unidades: number
    unidades_main: number
    unidades_addon: number
    ganancia: number
    ganancia_usd: number
    revenue_neto: number
    costo_total: number
    kit: number
    envio: number
    licencias_bloqueo: number
    contribucion_bruta: number
    adquirencia: number
    incobrables: number
    sueldos: number
    otros_costo: number
    intereses: number
    impuestos: number
    contribucion_neta: number
  }
}

const DEFAULT_CONFIG: ConfigResultado = {
  kit_seguridad: 7000,
  envio_fulfillment: 15000,
  licencias_bloqueo: 7500,
  sueldos: 1250,
  otros: 1000,
  adquirencia: 0.8,
  incobrables: 6.5,
  iibb: 4,
  com_e_ind: 1,
  tna: 27,
  plazo_pago_proveedor: 60,
  tipo_cambio: 1500,
}

const EMPTY_RESULT: ResultadoData = {
  productos: [],
  config: DEFAULT_CONFIG,
  totals: { unidades: 0, unidades_main: 0, unidades_addon: 0, ganancia: 0, ganancia_usd: 0, revenue_neto: 0, costo_total: 0, kit: 0, envio: 0, licencias_bloqueo: 0, contribucion_bruta: 0, adquirencia: 0, incobrables: 0, sueldos: 0, otros_costo: 0, intereses: 0, impuestos: 0, contribucion_neta: 0 },
}

// ─── Config CRUD ────────────────────────────────────────────────────────────

export async function fetchConfig(): Promise<ConfigResultado> {
  const sb = createAdminClient()
  const { data } = await sb.from('config_resultado').select('clave, valor')
  if (!data || data.length === 0) return DEFAULT_CONFIG

  const map: Record<string, number> = {}
  for (const row of data) map[row.clave] = Number(row.valor)

  return {
    kit_seguridad: map.kit_seguridad ?? DEFAULT_CONFIG.kit_seguridad,
    envio_fulfillment: map.envio_fulfillment ?? DEFAULT_CONFIG.envio_fulfillment,
    licencias_bloqueo: map.licencias_bloqueo ?? DEFAULT_CONFIG.licencias_bloqueo,
    sueldos: map.sueldos ?? DEFAULT_CONFIG.sueldos,
    otros: map.otros ?? DEFAULT_CONFIG.otros,
    adquirencia: map.adquirencia ?? DEFAULT_CONFIG.adquirencia,
    incobrables: map.incobrables ?? DEFAULT_CONFIG.incobrables,
    iibb: map.iibb ?? DEFAULT_CONFIG.iibb,
    com_e_ind: map.com_e_ind ?? DEFAULT_CONFIG.com_e_ind,
    tna: map.tna ?? DEFAULT_CONFIG.tna,
    plazo_pago_proveedor: map.plazo_pago_proveedor ?? DEFAULT_CONFIG.plazo_pago_proveedor,
    tipo_cambio: map.tipo_cambio ?? DEFAULT_CONFIG.tipo_cambio,
  }
}

export async function updateConfig(clave: string, valor: number) {
  const sb = createAdminClient()
  await sb.from('config_resultado').update({ valor, updated_at: new Date().toISOString() }).eq('clave', clave)
  revalidatePath('/finanzas')
}

// ─── Interest calculation ───────────────────────────────────────────────────

interface InstallmentRow {
  store_order_id: string
  display_name: string
  installment_number: number
  due_date: Date | string
  amount: number // in pesos (already /100)
  order_date: Date | string
}

function calcularInteresPorOrder(
  installments: InstallmentRow[],
  costo: number,
  plazo_pago_dias: number,
  tna: number,
  orderDate: Date
): number {
  if (installments.length === 0 || costo <= 0) return 0

  // Build cash flow events
  const events: { day: number; amount: number }[] = []

  // Cobros: each installment
  for (const inst of installments) {
    const dueDate = inst.due_date instanceof Date ? inst.due_date : new Date(inst.due_date)
    const day = Math.round((dueDate.getTime() - orderDate.getTime()) / 86400000)
    events.push({ day: Math.max(day, 0), amount: inst.amount })
  }

  // Pago proveedor
  events.push({ day: plazo_pago_dias, amount: -costo })

  // Sort by day
  events.sort((a, b) => a.day - b.day)

  // Calculate interest on negative balance
  const dailyRate = tna / 100 / 365
  let balance = 0
  let totalInterest = 0
  let prevDay = 0

  for (const ev of events) {
    const days = ev.day - prevDay
    if (days > 0 && balance < 0) {
      totalInterest += Math.abs(balance) * dailyRate * days
    }
    balance += ev.amount
    prevDay = ev.day
  }

  // If still negative after last event, we don't charge more (order complete)
  return totalInterest
}

// ─── Main fetch ─────────────────────────────────────────────────────────────

export async function fetchResultadoTienda(desde: string, hasta: string): Promise<ResultadoData> {
  const pool = getPool()
  if (!pool) return EMPTY_RESULT

  const [config, costosMap] = await Promise.all([
    fetchConfig(),
    fetchCostos(),
  ])

  const client = await pool.connect()
  try {
    // IDs propios para filtrar
    const { CLIENT_IDS_PROPIOS } = await import('@/lib/client-ids')

    // 1. Sales by product (main + addon) — source: gocuotas_orders delivered
    const ventasRes = await client.query<{
      display_name: string; kind: string; units: string; avg_price: string
    }>(`
      SELECT
        oi.display_name,
        oi.kind,
        COUNT(*)::int AS units,
        AVG(oi.unit_price / 100)::numeric AS avg_price
      FROM gocuotas_orders go2
      JOIN store_orders so ON so.id::text = go2.store_order_id
      JOIN store_order_items oi ON oi.order_id = so.id
      WHERE go2.order_delivered_at IS NOT NULL
        AND go2.order_discarded_at IS NULL
        AND go2.client_id::text = ANY($3)
        AND go2.order_created_at >= $1::date AND go2.order_created_at < ($2::date + 1)
        AND oi.display_name NOT ILIKE '%test%' AND oi.display_name NOT ILIKE '%prueba%'
      GROUP BY oi.display_name, oi.kind
      ORDER BY units DESC
    `, [desde, hasta, CLIENT_IDS_PROPIOS])

    // 2. Interest: get installments for delivered orders in period
    const installmentsRes = await client.query<{
      store_order_id: string; display_name: string; installment_number: number
      due_date: Date | string; amount: string; order_date: Date | string
    }>(`
      SELECT
        go2.store_order_id,
        oi.display_name,
        gi.installment_number,
        gi.installment_due_at AS due_date,
        gi.installment_amount AS amount,
        go2.order_created_at AS order_date
      FROM gocuotas_installments gi
      JOIN gocuotas_orders go2 ON go2.order_id = gi.order_id
      JOIN store_orders so ON so.id::text = go2.store_order_id
      JOIN store_order_items oi ON oi.order_id = so.id AND oi.kind = 'main'
      WHERE go2.order_delivered_at IS NOT NULL
        AND go2.order_discarded_at IS NULL
        AND go2.client_id::text = ANY($3)
        AND go2.order_created_at >= $1::date AND go2.order_created_at < ($2::date + 1)
      ORDER BY go2.store_order_id, gi.installment_number
    `, [desde, hasta, CLIENT_IDS_PROPIOS])

    // Group installments by order and calculate interest per order
    const orderInstallments = new Map<string, { display_name: string; installments: InstallmentRow[]; orderDate: Date }>()
    for (const row of installmentsRes.rows) {
      const orderId = row.store_order_id
      if (!orderInstallments.has(orderId)) {
        orderInstallments.set(orderId, {
          display_name: row.display_name,
          installments: [],
          orderDate: row.order_date instanceof Date ? row.order_date : new Date(String(row.order_date)),
        })
      }
      orderInstallments.get(orderId)!.installments.push({
        ...row,
        amount: Number(row.amount), // GOcuotas amounts are already in pesos (not centavos)
      })
    }

    // Calculate total interest per product (sum of all orders)
    const interestByProduct = new Map<string, number>()
    for (const [, order] of orderInstallments) {
      const costo = costosMap.get(order.display_name) ?? 0
      if (costo <= 0) continue

      const interes = calcularInteresPorOrder(
        order.installments, costo, config.plazo_pago_proveedor, config.tna, order.orderDate
      )

      interestByProduct.set(order.display_name, (interestByProduct.get(order.display_name) ?? 0) + interes)
    }

    // 3. Build P&L per product
    const productos: ProductoResultado[] = ventasRes.rows.map(row => {
      const nombre = row.display_name
      const kind = row.kind as 'main' | 'addon'
      const unidades = Number(row.units)
      const precioVentaBruto = Number(row.avg_price)
      const precioNeto = precioVentaBruto / 1.21
      const costo = costosMap.get(nombre) ?? 0
      const multiplo = costo > 0 ? precioNeto / costo : 0

      const isMain = kind === 'main'
      const kit = isMain ? config.kit_seguridad : 0
      const envio = isMain ? config.envio_fulfillment : 0
      const licenciasBloqueo = isMain ? config.licencias_bloqueo : 0
      const contribBruta = precioNeto - costo - kit - envio - licenciasBloqueo

      // Adquirencia e incobrables sobre order amount (con IVA)
      const adquirencia = precioVentaBruto * config.adquirencia / 100
      const incobrables = precioVentaBruto * config.incobrables / 100
      const sueldos = isMain ? config.sueldos : 0
      const otrosCosto = isMain ? config.otros : 0

      // Intereses: total real de todas las orders de este producto
      const interesesTotalProducto = isMain ? (interestByProduct.get(nombre) ?? 0) : 0
      const intereses = unidades > 0 ? interesesTotalProducto / unidades : 0

      // Impuestos: IIBB + Com e Ind sobre revenue neto, Débitos y Créditos sobre order amount (con IVA)
      const impuestosRevenue = precioNeto * (config.iibb + config.com_e_ind) / 100
      const impuestosDebCred = precioVentaBruto * 1.2 / 100
      const impuestos = impuestosRevenue + impuestosDebCred

      const contribNeta = contribBruta - adquirencia - incobrables - sueldos - otrosCosto - intereses - impuestos
      // Ganancia: usamos el interés total real, no el promedio × unidades
      const gananciaCalc = (contribBruta - adquirencia - incobrables - sueldos - otrosCosto - impuestos) * unidades - interesesTotalProducto
      const ganancia = Math.round(gananciaCalc)

      return {
        nombre,
        kind,
        unidades,
        precio_venta_neto: Math.round(precioNeto),
        costo,
        multiplo: Math.round(multiplo * 100) / 100,
        kit,
        envio,
        licencias_bloqueo: licenciasBloqueo,
        contribucion_bruta: Math.round(contribBruta),
        adquirencia: Math.round(adquirencia),
        incobrables: Math.round(incobrables),
        sueldos,
        otros_costo: otrosCosto,
        intereses: Math.round(intereses),
        impuestos: Math.round(impuestos),
        contribucion_neta: Math.round(contribNeta),
        rentabilidad_costo: costo > 0 ? Math.round((contribNeta / costo) * 10000) / 100 : 0,
        rentabilidad_venta: precioNeto > 0 ? Math.round((contribNeta / precioNeto) * 10000) / 100 : 0,
        ganancia,
        ganancia_usd: config.tipo_cambio > 0 ? Math.round(ganancia / config.tipo_cambio) : 0,
      }
    })

    // Sort: main first (by units desc), then addon (by units desc)
    productos.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'main' ? -1 : 1
      return b.unidades - a.unidades
    })

    const sum = (fn: (p: ProductoResultado) => number) => productos.reduce((s, p) => s + fn(p), 0)
    const sumU = (key: keyof ProductoResultado) => productos.reduce((s, p) => s + (p[key] as number) * p.unidades, 0)

    return {
      productos,
      config,
      totals: {
        unidades: sum(p => p.unidades),
        unidades_main: productos.filter(p => p.kind === 'main').reduce((s, p) => s + p.unidades, 0),
        unidades_addon: productos.filter(p => p.kind === 'addon').reduce((s, p) => s + p.unidades, 0),
        ganancia: sum(p => p.ganancia),
        ganancia_usd: sum(p => p.ganancia_usd),
        revenue_neto: sumU('precio_venta_neto'),
        costo_total: sumU('costo'),
        kit: sumU('kit'),
        envio: sumU('envio'),
        licencias_bloqueo: sumU('licencias_bloqueo'),
        contribucion_bruta: sumU('contribucion_bruta'),
        adquirencia: sumU('adquirencia'),
        incobrables: sumU('incobrables'),
        sueldos: sumU('sueldos'),
        otros_costo: sumU('otros_costo'),
        intereses: [...interestByProduct.values()].reduce((s, v) => s + v, 0),
        impuestos: sumU('impuestos'),
        contribucion_neta: sumU('contribucion_neta'),
      },
    }
  } finally {
    client.release()
  }
}

// ─── Costos from compras_precios (Supabase) ─────────────────────────────────

async function fetchCostos(): Promise<Map<string, number>> {
  const sb = createAdminClient()

  const [{ data: productos }, { data: precios }] = await Promise.all([
    sb.from('compras_productos').select('id, nombre'),
    sb.from('compras_precios').select('producto_id, precio'),
  ])

  if (!productos || !precios) return new Map()

  // Min price per producto_id
  const minByProductoId = new Map<string, number>()
  for (const p of precios) {
    const precio = Number(p.precio)
    const existing = minByProductoId.get(p.producto_id)
    if (!existing || precio < existing) {
      minByProductoId.set(p.producto_id, precio)
    }
  }

  // Map nombre → min precio
  const result = new Map<string, number>()
  for (const prod of productos) {
    const min = minByProductoId.get(prod.id)
    if (min !== undefined) {
      result.set(prod.nombre, min)
    }
  }

  // Also map common display_name variants to compras_productos names
  // store_order_items uses display_name which may differ slightly from compras_productos.nombre
  const nameMap: Record<string, string> = {
    'Motorola Moto G06 64GB': 'Motorola Moto G06 64GB',
    'Motorola Moto G06 128GB': 'Motorola Moto G06 4/128GB',
    'Motorola Moto G17 128GB': 'Motorola Moto G17 4/128GB',
    'Motorola Moto G17 256GB': 'Motorola Moto G17 4/256GB',
    'Motorola Moto G67 256GB': 'Motorola Moto G67 4/256GB',
    'Motorola Moto G77 5G 256GB': 'Motorola Moto G77 8/256GB 5G',
    'Samsung Galaxy A07 64GB': 'Samsung Galaxy A07 4/64GB',
    'Samsung Galaxy A07 128GB': 'Samsung Galaxy A07 4/128GB',
    'Samsung Galaxy A17 128GB': 'Samsung Galaxy A17 4/128GB',
    'Samsung Galaxy A17 5G 8/256GB': 'Samsung Galaxy A17 5G 8/256GB',
    'Xiaomi Redmi 14C 128/4 GB': 'Xiaomi Redmi 14C 128/4 GB',
    'Xiaomi Redmi 14C 256/4 GB': 'Xiaomi Redmi 14C 256/4 GB',
    'Xiaomi Redmi Note 14 128/6GB': 'Xiaomi Redmi Note 14 128/6GB',
    'Xiaomi Redmi Note 14 Pro 256/8GB': 'Xiaomi Redmi Note 14 Pro 256/8GB',
    'Auriculares Redmi Buds 6 Play': 'Redmi Buds 6 Play ',
    'Parlante Xiaomi 2 Bluetooth': 'XIAOMI Speaker 2 Bluetooth',
    'Pulsera inteligente Xiaomi 9 Active': 'Xiaomi Samrt Band 9 Active',
    'Samsung Galaxy A36 5G 256GB': 'Samsung Galaxy A36 5G 256GB',
    'Samsung Galaxy A56 5G 256GB': 'Samsung Galaxy A56 5G 256GB',
    'Motorola Moto G56 5G 256GB': 'Motorola Moto G56 5G 256/8GB',
  }

  // For each store display_name, find the cost via mapped compras name
  const finalMap = new Map<string, number>()
  for (const [displayName, comprasName] of Object.entries(nameMap)) {
    const cost = result.get(comprasName.trim())
    if (cost !== undefined) finalMap.set(displayName, cost)
  }

  // Also add direct matches
  for (const [nombre, precio] of result) {
    if (!finalMap.has(nombre)) finalMap.set(nombre, precio)
  }

  return finalMap
}
