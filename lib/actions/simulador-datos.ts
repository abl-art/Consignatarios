'use server'

import { getPool } from '@/lib/db-pool'
import { CLIENT_IDS_PROPIOS, CLIENT_IDS_TERCEROS, SQL_IDS_TERCEROS } from '@/lib/client-ids'
import { fetchVintageAnalysis, fetchPDIndicadores } from '@/lib/actions/finanzas'
import { getListaPrecios } from '@/lib/actions/lista-precios-canales'
import { type FilaListaPrecios } from '@/lib/lista-precios'
import { derivarIncobrabilidad, derivarMoraDias, type DatosCanal } from '@/lib/simulador-canal'

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

export async function getDatosSimulador(): Promise<DatosSimulador> {
  const [vinPropia, vinTerceros, pdPropia, pdTerceros, modelos, ticketTerceros] = await Promise.all([
    fetchVintageAnalysis(CLIENT_IDS_PROPIOS),
    fetchVintageAnalysis(CLIENT_IDS_TERCEROS),
    fetchPDIndicadores(CLIENT_IDS_PROPIOS),
    fetchPDIndicadores(CLIENT_IDS_TERCEROS),
    getListaPrecios(),
    fetchTicketPromedioTerceros(),
  ])
  const hoy = new Date()
  const fpd = (pd: Awaited<ReturnType<typeof fetchPDIndicadores>>) =>
    pd.resumen.find(r => r.cuota === 1)?.pd_hard ?? null
  return {
    propia: {
      incobrabilidad_pct: derivarIncobrabilidad(vinPropia, hoy),
      fpd_pct: fpd(pdPropia),
      mora_dias: derivarMoraDias(vinPropia),
      ticket_promedio: null,
    },
    terceros: {
      incobrabilidad_pct: derivarIncobrabilidad(vinTerceros, hoy),
      fpd_pct: fpd(pdTerceros),
      mora_dias: derivarMoraDias(vinTerceros),
      ticket_promedio: ticketTerceros,
    },
    modelos,
  }
}
