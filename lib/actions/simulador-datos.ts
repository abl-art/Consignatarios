'use server'

import { getPool } from '@/lib/db-pool'
import { CLIENT_IDS_PROPIOS, CLIENT_IDS_TERCEROS, SQL_IDS_TERCEROS } from '@/lib/client-ids'
import { fetchVintageAnalysis, fetchPDIndicadores, type VintageRow } from '@/lib/actions/finanzas'
import { fetchOrderIdsConContracargo, fetchOrderIdsTransicion30d } from '@/lib/gocelular'
import { getListaPrecios } from '@/lib/actions/lista-precios-canales'
import { type FilaListaPrecios } from '@/lib/lista-precios'
import { incobrabilidadResuelta, derivarMoraDias, type DatosCanal } from '@/lib/simulador-canal'

export interface DatosSimulador {
  propia: DatosCanal
  terceros: DatosCanal
  modelos: FilaListaPrecios[]
}

// Ticket promedio del canal terceros: total por orden (suma de cuotas) de
// órdenes entregadas creadas en los últimos 30 días
async function fetchTicketPromedioTerceros(): Promise<number | null> {
  const pool = getPool()
  if (!pool) return null
  const client = await pool.connect()
  try {
    const res = await client.query<{ ticket: string | null }>(`
      SELECT AVG(t.total) AS ticket FROM (
        SELECT i.order_id, SUM(i.installment_amount) AS total
        FROM gocuotas_installments i
        JOIN gocuotas_orders o ON o.order_id::text = i.order_id::text
        WHERE o.order_created_at >= CURRENT_DATE - 30
          AND o.order_delivered_at IS NOT NULL
          AND o.order_discarded_at IS NULL
          AND o.client_id::text IN (${SQL_IDS_TERCEROS})
        GROUP BY 1
      ) t
    `)
    const v = res.rows[0]?.ticket
    return v ? Number(v) : null
  } finally {
    client.release()
  }
}

// Incobrabilidad del canal sobre lo RESUELTO: cuotas de órdenes sanas vencidas
// hace 120+ días, más las órdenes castigadas (contracargo completo; transición
// solo lo no cobrado — lo ya cobrado fue ingreso real). Regla de Emiliano 10/9.
async function fetchIncobrabilidadCanal(
  clientIds: string[],
  cbIds: string[],
  transIds: string[],
): Promise<number | null> {
  const pool = getPool()
  if (!pool) return null
  const idsSeguros = clientIds.filter(id => /^\d+$/.test(id))
  if (idsSeguros.length === 0) return null
  const sqlIds = idsSeguros.map(id => `'${id}'`).join(', ')
  const lista = (ids: string[]) => {
    const seguros = ids.filter(id => /^\d+$/.test(id))
    return seguros.length > 0 ? seguros.map(id => `'${id}'`).join(',') : "'0'"
  }
  const client = await pool.connect()
  try {
    const res = await client.query<{
      resueltas: string; mora120: string; cb_total: string; trans_total: string; trans_no_cobrado: string
    }>(`
      WITH base AS (
        SELECT i.installment_amount::float AS amt,
          CASE WHEN o.order_id::text IN (${lista(cbIds)}) THEN 'cb'
               WHEN o.order_id::text IN (${lista(transIds)}) THEN 'trans'
               ELSE 'normal' END AS clase,
          i.installment_due_at::date < CURRENT_DATE - 120 AS resuelta,
          (i.installment_collected_at IS NULL AND i.installment_discarded_at IS NULL
            AND CURRENT_DATE - i.installment_due_at::date >= 120) AS mora120,
          i.installment_collected_at IS NULL AS no_cobrada
        FROM gocuotas_installments i
        JOIN gocuotas_orders o ON o.order_id::text = i.order_id::text
        WHERE o.order_delivered_at IS NOT NULL
          AND o.order_discarded_at IS NULL
          AND o.client_id::text IN (${sqlIds})
      )
      SELECT
        COALESCE(SUM(amt) FILTER (WHERE clase = 'normal' AND resuelta), 0) AS resueltas,
        COALESCE(SUM(amt) FILTER (WHERE clase = 'normal' AND resuelta AND mora120), 0) AS mora120,
        COALESCE(SUM(amt) FILTER (WHERE clase = 'cb'), 0) AS cb_total,
        COALESCE(SUM(amt) FILTER (WHERE clase = 'trans'), 0) AS trans_total,
        COALESCE(SUM(amt) FILTER (WHERE clase = 'trans' AND no_cobrada), 0) AS trans_no_cobrado
      FROM base
    `)
    const r = res.rows[0]
    if (!r) return null
    return incobrabilidadResuelta({
      resueltas: Number(r.resueltas),
      mora120: Number(r.mora120),
      cbTotal: Number(r.cb_total),
      transTotal: Number(r.trans_total),
      transNoCobrado: Number(r.trans_no_cobrado),
    })
  } finally {
    client.release()
  }
}

// Datos por canal ya fetcheados por el caller (la page los usa también para las
// píldoras de PD/DPD/Vintage) — evita repetir las mismas queries
export interface PrefetchSimulador {
  vinPropia: VintageRow[]
  vinTerceros: VintageRow[]
  pdPropia: Awaited<ReturnType<typeof fetchPDIndicadores>>
  pdTerceros: Awaited<ReturnType<typeof fetchPDIndicadores>>
}

export async function getDatosSimulador(prefetch?: PrefetchSimulador): Promise<DatosSimulador> {
  const [cbIds, transIds] = await Promise.all([
    fetchOrderIdsConContracargo().catch(() => [] as string[]),
    fetchOrderIdsTransicion30d().catch(() => [] as string[]),
  ])
  const [vinPropia, vinTerceros, pdPropia, pdTerceros, modelos, ticketTerceros, incobPropia, incobTerceros] = await Promise.all([
    prefetch ? Promise.resolve(prefetch.vinPropia) : fetchVintageAnalysis(CLIENT_IDS_PROPIOS),
    prefetch ? Promise.resolve(prefetch.vinTerceros) : fetchVintageAnalysis(CLIENT_IDS_TERCEROS),
    prefetch ? Promise.resolve(prefetch.pdPropia) : fetchPDIndicadores(CLIENT_IDS_PROPIOS),
    prefetch ? Promise.resolve(prefetch.pdTerceros) : fetchPDIndicadores(CLIENT_IDS_TERCEROS),
    getListaPrecios(),
    fetchTicketPromedioTerceros(),
    fetchIncobrabilidadCanal(CLIENT_IDS_PROPIOS, cbIds, transIds),
    fetchIncobrabilidadCanal(CLIENT_IDS_TERCEROS, cbIds, transIds),
  ])
  const fpd = (pd: Awaited<ReturnType<typeof fetchPDIndicadores>>) =>
    pd.resumen.find(r => r.cuota === 1)?.pd_hard ?? null
  return {
    propia: {
      incobrabilidad_pct: incobPropia,
      fpd_pct: fpd(pdPropia),
      mora_dias: derivarMoraDias(vinPropia),
      ticket_promedio: null,
    },
    terceros: {
      incobrabilidad_pct: incobTerceros,
      fpd_pct: fpd(pdTerceros),
      mora_dias: derivarMoraDias(vinTerceros),
      ticket_promedio: ticketTerceros,
    },
    modelos,
  }
}
