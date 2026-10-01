// Datos del link para Samsung (/partner/samsung). Server-only: lee la réplica
// de GOcelular (ventas propias con marca vía devices) y los runs congelados de
// proyección (Supabase, nivel propia, ambos métodos).

import { getPool } from '@/lib/db-pool'
import { createAdminClient } from '@/lib/supabase/admin'
import { SQL_IDS_PROPIOS } from '@/lib/client-ids'
import {
  armarEscenarios,
  armarRankingConPlan,
  calcularShare,
  modeloComercialSamsung,
  type EscenarioMes,
  type MesProyeccion,
  type ModeloRanking,
} from '@/lib/partner-samsung'

// Ventana FIJA del share pre-acuerdo (definición de Emiliano: el histórico
// hasta el 30/9 es un dato fijo)
const SHARE_FIJO_DESDE = '2026-07-01'
const SHARE_FIJO_HASTA = '2026-10-01'
const ACUERDO_DESDE = '2026-10-01'

export interface DatosPartnerSamsung {
  mesActual: string
  runMes: string
  shareFijo: number
  shareActual: number
  muestraActual: { samsung: number; total: number } // órdenes desde el 1/10
  historico: { mes: string; samsung: number; total: number }[] // jun-sep, contexto
  escenarios: EscenarioMes[]
  ranking: ModeloRanking[]
}

export async function getDatosPartnerSamsung(): Promise<DatosPartnerSamsung | null> {
  const pool = getPool()
  if (!pool) return null
  const client = await pool.connect()
  try {
    const [histRes, actualRes, rankRes] = await Promise.all([
      // Unidades propias por mes con flag Samsung (jun → sep, incluye la ventana del share fijo)
      client.query<{ mes: string; total: string; samsung: string }>(
        `SELECT to_char(date_trunc('month', o.created_at), 'YYYY-MM') AS mes,
                count(*)::text AS total,
                count(*) FILTER (WHERE d.marca ILIKE '%samsung%')::text AS samsung
         FROM gocuotas_orders o
         LEFT JOIN LATERAL (
           SELECT MIN(brand) AS marca FROM devices WHERE devices.order_id = o.order_id
         ) d ON true
         WHERE o.client_id::text IN (${SQL_IDS_PROPIOS})
           AND o.order_discarded_at IS NULL
           AND o.created_at >= '2026-06-01' AND o.created_at < '${SHARE_FIJO_HASTA}'
         GROUP BY 1 ORDER BY 1`
      ),
      // Share real desde el 1/10 (el "último share" que pide Emiliano)
      client.query<{ total: string; samsung: string }>(
        `SELECT count(*)::text AS total,
                count(*) FILTER (WHERE d.marca ILIKE '%samsung%')::text AS samsung
         FROM gocuotas_orders o
         LEFT JOIN LATERAL (
           SELECT MIN(brand) AS marca FROM devices WHERE devices.order_id = o.order_id
         ) d ON true
         WHERE o.client_id::text IN (${SQL_IDS_PROPIOS})
           AND o.order_discarded_at IS NULL
           AND o.created_at >= '${ACUERDO_DESDE}'`
      ),
      // Ranking de modelos Samsung en venta propia, últimos 90 días
      client.query<{ model: string; u: string }>(
        `SELECT d.model, count(*)::text AS u
         FROM devices d
         JOIN gocuotas_orders o ON o.order_id = d.order_id
         WHERE d.brand ILIKE '%samsung%'
           AND o.client_id::text IN (${SQL_IDS_PROPIOS})
           AND o.order_discarded_at IS NULL
           AND o.created_at >= now() - interval '90 days'
         GROUP BY 1`
      ),
    ])

    // Share fijo: jul-sep (junio queda solo como contexto del gráfico)
    const ventanaFija = histRes.rows.filter(r => r.mes >= '2026-07')
    const fijoSamsung = ventanaFija.reduce((a, r) => a + Number(r.samsung), 0)
    const fijoTotal = ventanaFija.reduce((a, r) => a + Number(r.total), 0)
    const shareFijo = calcularShare(fijoSamsung, fijoTotal)

    const muestraActual = {
      samsung: Number(actualRes.rows[0]?.samsung ?? 0),
      total: Number(actualRes.rows[0]?.total ?? 0),
    }
    // Sin ventas todavía desde el 1/10, el escenario "con acuerdo" arranca igual al fijo
    const shareActual = muestraActual.total > 0 ? calcularShare(muestraActual.samsung, muestraActual.total) : shareFijo

    // Proyección propia del último run congelado, ambos métodos
    const supabase = createAdminClient()
    const { data: runs } = await supabase
      .from('proyecciones_runs')
      .select('run_mes')
      .order('run_mes', { ascending: false })
      .limit(1)
    const runMes = runs?.[0]?.run_mes as string | undefined
    if (!runMes) return null
    const { data: proy } = await supabase
      .from('proyecciones_ventas')
      .select('mes, metodo, ventas')
      .eq('run_mes', runMes)
      .eq('nivel', 'propia')
      .order('mes')
    const porMes = new Map<string, MesProyeccion>()
    for (const p of proy ?? []) {
      const fila = porMes.get(p.mes) ?? { mes: p.mes, hibrido: 0, gocuotas: 0 }
      if (p.metodo === 'hibrido') fila.hibrido = Number(p.ventas)
      if (p.metodo === 'gocuotas') fila.gocuotas = Number(p.ventas)
      porMes.set(p.mes, fila)
    }
    const mesActual = new Date().toISOString().slice(0, 7)
    const meses = [...porMes.values()].filter(m => m.mes >= mesActual).sort((a, b) => a.mes.localeCompare(b.mes))

    const escenarios = armarEscenarios(meses, shareFijo, shareActual)

    const unidadesPorModelo = new Map<string, number>()
    for (const r of rankRes.rows) {
      const modelo = modeloComercialSamsung(r.model)
      unidadesPorModelo.set(modelo, (unidadesPorModelo.get(modelo) ?? 0) + Number(r.u))
    }
    const ranking = armarRankingConPlan(
      [...unidadesPorModelo.entries()].map(([modelo, unidades]) => ({ modelo, unidades })),
      escenarios
    )

    return {
      mesActual,
      runMes,
      shareFijo,
      shareActual,
      muestraActual,
      historico: histRes.rows.map(r => ({ mes: r.mes, samsung: Number(r.samsung), total: Number(r.total) })),
      escenarios,
      ranking,
    }
  } finally {
    client.release()
  }
}
