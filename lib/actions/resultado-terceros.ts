'use server'

import { getPool } from '@/lib/db-pool'
import { CLIENT_IDS_TERCEROS } from '@/lib/client-ids'
import { fetchConfig, type ConfigResultado } from '@/lib/actions/resultado'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ConfigResultadoTerceros extends ConfigResultado {
  comision_terceros: number   // % comisión al comercio
  liquidacion_1_pct: number   // % primer pago
  liquidacion_1_dias: number  // días primer pago
  liquidacion_2_pct: number   // % segundo pago
  liquidacion_2_dias: number  // días segundo pago
}

export interface MerchantResultado {
  merchant_name: string
  client_id: string
  unidades: number
  order_amount_total: number      // sum of all order amounts
  revenue_gocuotas: number        // order_amount × comisión%
  licencias_bloqueo: number
  sueldos: number
  adquirencia: number             // % sobre order_amount
  incobrables: number             // % sobre order_amount
  intereses: number
  impuestos: number               // IIBB + Com e Ind sobre revenue, Déb/Créd sobre order_amount
  contribucion_neta: number
  rentabilidad_revenue: number    // %
  ganancia: number
  ganancia_usd: number
}

export interface ResultadoTercerosData {
  merchants: MerchantResultado[]
  config: ConfigResultadoTerceros
  totals: {
    unidades: number
    order_amount_total: number
    revenue_gocuotas: number
    licencias_bloqueo: number
    sueldos: number
    adquirencia: number
    incobrables: number
    intereses: number
    impuestos: number
    contribucion_neta: number
    ganancia: number
    ganancia_usd: number
  }
}

const MERCHANT_NAMES: Record<string, string> = {
  '5495277': 'RIIING',
  '6033574': 'TECNO-COMPRO',
  '6115009': 'Plus Phone',
}

const EMPTY_RESULT: ResultadoTercerosData = {
  merchants: [],
  config: {
    kit_seguridad: 7000, envio_fulfillment: 15000, licencias_bloqueo: 7500,
    sueldos: 1250, otros: 1000, adquirencia: 0.8, incobrables: 6.5,
    iibb: 4, com_e_ind: 1, tna: 27, plazo_pago_proveedor: 60, tipo_cambio: 1500,
    comision_terceros: 23, liquidacion_1_pct: 50, liquidacion_1_dias: 60,
    liquidacion_2_pct: 50, liquidacion_2_dias: 90,
  },
  totals: {
    unidades: 0, order_amount_total: 0, revenue_gocuotas: 0, licencias_bloqueo: 0,
    sueldos: 0, adquirencia: 0, incobrables: 0, intereses: 0, impuestos: 0,
    contribucion_neta: 0, ganancia: 0, ganancia_usd: 0,
  },
}

// ─── Config with terceros-specific params ───────────────────────────────────

async function fetchConfigTerceros(): Promise<ConfigResultadoTerceros> {
  const base = await fetchConfig()
  const { createAdminClient } = await import('@/lib/supabase/admin')
  const sb = createAdminClient()
  const { data } = await sb.from('config_resultado').select('clave, valor')
  const map: Record<string, number> = {}
  if (data) for (const row of data) map[row.clave] = Number(row.valor)

  return {
    ...base,
    comision_terceros: map.comision_terceros ?? 23,
    liquidacion_1_pct: map.liquidacion_1_pct ?? 50,
    liquidacion_1_dias: map.liquidacion_1_dias ?? 60,
    liquidacion_2_pct: map.liquidacion_2_pct ?? 50,
    liquidacion_2_dias: map.liquidacion_2_dias ?? 90,
  }
}

// ─── Interest calculation for terceros ──────────────────────────────────────

function calcularInteresTerceros(
  cuotas: { due_date: Date | string; amount: number }[],
  orderAmount: number,
  comisionPct: number,
  liq1Pct: number, liq1Dias: number,
  liq2Pct: number, liq2Dias: number,
  tna: number,
  orderDate: Date,
): number {
  if (cuotas.length === 0) return 0

  const montoComercio = orderAmount * (1 - comisionPct / 100)
  const liq1 = montoComercio * liq1Pct / 100
  const liq2 = montoComercio * liq2Pct / 100

  // Cash flow events
  const events: { day: number; amount: number }[] = []

  // Cobros de cuotas
  for (const c of cuotas) {
    const d = c.due_date instanceof Date ? c.due_date : new Date(String(c.due_date))
    const day = Math.max(Math.round((d.getTime() - orderDate.getTime()) / 86400000), 0)
    events.push({ day, amount: c.amount })
  }

  // Liquidaciones al comercio (egresos)
  events.push({ day: liq1Dias, amount: -liq1 })
  events.push({ day: liq2Dias, amount: -liq2 })

  events.sort((a, b) => a.day - b.day)

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

  return totalInterest
}

// ─── Main fetch ─────────────────────────────────────────────────────────────

export async function fetchResultadoTerceros(desde: string, hasta: string): Promise<ResultadoTercerosData> {
  const pool = getPool()
  if (!pool) return EMPTY_RESULT

  const config = await fetchConfigTerceros()
  const ids = CLIENT_IDS_TERCEROS.filter(id => id !== '1')
  if (ids.length === 0) return { ...EMPTY_RESULT, config }

  const client = await pool.connect()
  try {
    // 1. Orders by merchant
    const ordersRes = await client.query<{
      client_id: string; units: string; total_amount: string
    }>(`
      SELECT client_id, COUNT(*)::int AS units,
        SUM(total_order_amount)::numeric AS total_amount
      FROM gocuotas_orders
      WHERE client_id = ANY($3)
        AND order_discarded_at IS NULL
        AND order_created_at >= $1::date AND order_created_at < ($2::date + 1)
      GROUP BY client_id
      ORDER BY total_amount DESC
    `, [desde, hasta, ids])

    // 2. Installments for interest calculation
    const installRes = await client.query<{
      client_id: string; order_id: string; total_order_amount: string
      installment_number: number; due_date: Date | string; amount: string
      order_date: Date | string
    }>(`
      SELECT go2.client_id, go2.order_id, go2.total_order_amount,
        gi.installment_number, gi.installment_due_at AS due_date,
        gi.installment_amount AS amount, go2.order_created_at AS order_date
      FROM gocuotas_installments gi
      JOIN gocuotas_orders go2 ON go2.order_id = gi.order_id
      WHERE go2.client_id = ANY($3)
        AND go2.order_discarded_at IS NULL
        AND go2.order_created_at >= $1::date AND go2.order_created_at < ($2::date + 1)
      ORDER BY go2.order_id, gi.installment_number
    `, [desde, hasta, ids])

    // Group installments by order
    const orderMap = new Map<string, { client_id: string; orderAmount: number; orderDate: Date; cuotas: { due_date: Date | string; amount: number }[] }>()
    for (const row of installRes.rows) {
      if (!orderMap.has(row.order_id)) {
        orderMap.set(row.order_id, {
          client_id: row.client_id,
          orderAmount: Number(row.total_order_amount),
          orderDate: row.order_date instanceof Date ? row.order_date : new Date(String(row.order_date)),
          cuotas: [],
        })
      }
      orderMap.get(row.order_id)!.cuotas.push({
        due_date: row.due_date,
        amount: Number(row.amount),
      })
    }

    // Calculate average interest per merchant
    const interestByMerchant = new Map<string, { total: number; count: number }>()
    for (const [, order] of orderMap) {
      const interes = calcularInteresTerceros(
        order.cuotas, order.orderAmount, config.comision_terceros,
        config.liquidacion_1_pct, config.liquidacion_1_dias,
        config.liquidacion_2_pct, config.liquidacion_2_dias,
        config.tna, order.orderDate,
      )
      const existing = interestByMerchant.get(order.client_id)
      if (existing) { existing.total += interes; existing.count++ }
      else interestByMerchant.set(order.client_id, { total: interes, count: 1 })
    }

    // 3. Build P&L per merchant
    const merchants: MerchantResultado[] = ordersRes.rows.map(row => {
      const clientId = row.client_id
      const unidades = Number(row.units)
      const orderAmountTotal = Number(row.total_amount)
      const revenueGocuotas = orderAmountTotal * config.comision_terceros / 100

      const licencias = config.licencias_bloqueo * unidades
      const sueldos = config.sueldos * unidades
      const adquirencia = orderAmountTotal * config.adquirencia / 100
      const incobrables = orderAmountTotal * config.incobrables / 100

      const intData = interestByMerchant.get(clientId)
      const intereses = intData ? intData.total : 0

      // Impuestos: IIBB + Com e Ind sobre revenue GOcuotas, Déb/Créd sobre order_amount
      const impuestosRevenue = revenueGocuotas * (config.iibb + config.com_e_ind) / 100
      const impuestosDebCred = orderAmountTotal * 1.2 / 100
      const impuestos = impuestosRevenue + impuestosDebCred

      const contribNeta = revenueGocuotas - licencias - sueldos - adquirencia - incobrables - intereses - impuestos
      const ganancia = Math.round(contribNeta)
      const gananciaUsd = config.tipo_cambio > 0 ? Math.round(ganancia / config.tipo_cambio) : 0

      return {
        merchant_name: MERCHANT_NAMES[clientId] ?? `Cliente ${clientId}`,
        client_id: clientId,
        unidades,
        order_amount_total: Math.round(orderAmountTotal),
        revenue_gocuotas: Math.round(revenueGocuotas),
        licencias_bloqueo: Math.round(licencias),
        sueldos: Math.round(sueldos),
        adquirencia: Math.round(adquirencia),
        incobrables: Math.round(incobrables),
        intereses: Math.round(intereses),
        impuestos: Math.round(impuestos),
        contribucion_neta: Math.round(contribNeta),
        rentabilidad_revenue: revenueGocuotas > 0 ? Math.round((contribNeta / revenueGocuotas) * 10000) / 100 : 0,
        ganancia,
        ganancia_usd: gananciaUsd,
      }
    })

    const sumM = (fn: (m: MerchantResultado) => number) => merchants.reduce((s, m) => s + fn(m), 0)

    return {
      merchants,
      config,
      totals: {
        unidades: sumM(m => m.unidades),
        order_amount_total: sumM(m => m.order_amount_total),
        revenue_gocuotas: sumM(m => m.revenue_gocuotas),
        licencias_bloqueo: sumM(m => m.licencias_bloqueo),
        sueldos: sumM(m => m.sueldos),
        adquirencia: sumM(m => m.adquirencia),
        incobrables: sumM(m => m.incobrables),
        intereses: sumM(m => m.intereses),
        impuestos: sumM(m => m.impuestos),
        contribucion_neta: sumM(m => m.contribucion_neta),
        ganancia: sumM(m => m.ganancia),
        ganancia_usd: sumM(m => m.ganancia_usd),
      },
    }
  } finally {
    client.release()
  }
}
