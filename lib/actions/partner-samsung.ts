// Datos del link para Samsung (/partner/samsung). Server-only: lee la réplica
// de GOcelular y los runs congelados de proyección (Supabase, ambos métodos).
//
// REGLA DE MARCA POR VENTA (Emiliano, 2/10): el share se mide sobre VENTAS
// CONFIRMADAS — no descartadas Y order_delivered_at NOT NULL (en GOcuotas se
// estampa al aprobar el crédito, no con la entrega física: las 216 órdenes del
// 1-2/10 ya lo tenían; los carros abandonados quedan 'discarded'). Marca:
// - propia: primera palabra de store_orders.product_name (misma fuente que el
//   cuadro "Qué vendemos" del Dashboard 360) — cobertura 100% al instante.
// - terceros: devices.brand (el comercio enrola el equipo al vender).
// NUNCA usar la asignación de Andreani para la ventana fresca: el device de
// venta propia llega al picking con ~1 día de lag y aplasta el share.

import { getPool } from '@/lib/db-pool'
import { createAdminClient } from '@/lib/supabase/admin'
import { CLIENT_IDS_PROPIOS, sqlCondicionClientes } from '@/lib/client-ids'
import {
  agruparMarcas,
  armarEscenarios,
  armarRankingConPlan,
  modeloComercialSamsung,
  normalizarMarca,
  shareSamsung,
  type EscenarioMes,
  type MesProyeccion,
  type ModeloRanking,
  type VentaMarca,
} from '@/lib/partner-samsung'

// Ventana FIJA del share pre-acuerdo (definición de Emiliano: el histórico
// hasta el 30/9 es un dato fijo). Límites en hora argentina.
const CONTEXTO_DESDE = '2026-06-01T00:00:00-03:00'
const SHARE_FIJO_HASTA = '2026-10-01T00:00:00-03:00'
const ACUERDO_DESDE = SHARE_FIJO_HASTA
const TZ_AR = 'America/Argentina/Buenos_Aires'

export type CanalPartner = 'total' | 'propia' | 'terceros'

// Condición de canal sobre la RÉPLICA (universo GOcelular — notIn permitido acá)
function condCanal(canal: CanalPartner): string {
  if (canal === 'total') return ''
  const filtro = canal === 'propia' ? CLIENT_IDS_PROPIOS : { notIn: CLIENT_IDS_PROPIOS }
  const cond = sqlCondicionClientes(filtro, 'o.client_id')
  return cond ? `AND ${cond}` : ''
}

// Marca de la venta: product_name para órdenes propias, devices.brand para
// terceros (ver regla arriba). Requiere los joins de FROM_VENTAS.
const COND_PROPIO = sqlCondicionClientes(CLIENT_IDS_PROPIOS, 'o.client_id')
const MARCA_VENTA = `CASE WHEN ${COND_PROPIO} THEN SPLIT_PART(so.product_name, ' ', 1) ELSE d.marca END`
const MODELO_VENTA = `CASE WHEN ${COND_PROPIO} THEN so.product_name ELSE d.model END`
const FROM_VENTAS = `
  FROM gocuotas_orders o
  LEFT JOIN store_orders so ON so.gocuotas_order_id = o.order_id
  LEFT JOIN LATERAL (
    SELECT MIN(brand) AS marca, MIN(model) AS model FROM devices WHERE devices.order_id = o.order_id
  ) d ON true`

export interface SkuVendido {
  sku: string
  hoy: number
  ayer: number
  d7: number
  d30: number
  mes: number
}

export interface DatosPartnerSamsung {
  canal: CanalPartner
  mesActual: string
  runMes: string
  shareFijo: number
  shareActual: number
  // Muestra desde el 1/10: ventas con marca conocida (en propia la marca sale
  // del producto vendido → cobertura inmediata; total = todas las órdenes)
  muestraActual: { samsung: number; conMarca: number; total: number }
  historico: { mes: string; samsung: number; total: number }[] // jun-sep, contexto
  marcasFijo: VentaMarca[] // torta jul-sep (ventana del share fijo)
  marcasActual: VentaMarca[] // torta desde el 1/10
  escenarios: EscenarioMes[]
  ranking: ModeloRanking[]
  skusSamsung: SkuVendido[] // SKUs propios vendidos (solo se llena en canal propia)
}

export async function getDatosPartnerSamsung(canal: CanalPartner = 'propia'): Promise<DatosPartnerSamsung | null> {
  const pool = getPool()
  if (!pool) return null
  const filtroCanal = condCanal(canal)
  const client = await pool.connect()
  try {
    const [histRes, actualRes, rankRes, skuRes] = await Promise.all([
      // Ventas por mes y marca (jun → sep, incluye la ventana del share fijo)
      client.query<{ mes: string; marca: string | null; ventas: string }>(
        `SELECT to_char(date_trunc('month', o.order_created_at AT TIME ZONE '${TZ_AR}'), 'YYYY-MM') AS mes,
                ${MARCA_VENTA} AS marca,
                count(*)::text AS ventas
         ${FROM_VENTAS}
         WHERE o.order_discarded_at IS NULL AND o.order_delivered_at IS NOT NULL ${filtroCanal}
           AND o.order_created_at >= '${CONTEXTO_DESDE}' AND o.order_created_at < '${SHARE_FIJO_HASTA}'
         GROUP BY 1, 2 ORDER BY 1`
      ),
      // Ventas por marca desde el 1/10 (el "último share" que pide Emiliano)
      client.query<{ marca: string | null; ventas: string }>(
        `SELECT ${MARCA_VENTA} AS marca, count(*)::text AS ventas
         ${FROM_VENTAS}
         WHERE o.order_discarded_at IS NULL AND o.order_delivered_at IS NOT NULL ${filtroCanal}
           AND o.order_created_at >= '${ACUERDO_DESDE}'
         GROUP BY 1`
      ),
      // Ranking de modelos Samsung vendidos, últimos 90 días
      client.query<{ model: string | null; u: string }>(
        `SELECT ${MODELO_VENTA} AS model, count(*)::text AS u
         ${FROM_VENTAS}
         WHERE o.order_discarded_at IS NULL AND o.order_delivered_at IS NOT NULL ${filtroCanal}
           AND (${MARCA_VENTA}) ILIKE '%samsung%'
           AND o.order_created_at >= now() - interval '90 days'
         GROUP BY 1`
      ),
      // SKUs Samsung vendidos en la tienda propia, por período (píldoras).
      // Ventana madre 30 días: "este mes" siempre cae adentro.
      canal === 'propia'
        ? client.query<{ sku: string; hoy: string; ayer: string; d7: string; d30: string; mes: string }>(
            `WITH ventas AS (
               SELECT so.product_name AS sku,
                      (o.order_created_at AT TIME ZONE '${TZ_AR}')::date AS fecha,
                      (now() AT TIME ZONE '${TZ_AR}')::date AS hoy
               FROM gocuotas_orders o
               JOIN store_orders so ON so.gocuotas_order_id = o.order_id
               WHERE o.order_discarded_at IS NULL AND o.order_delivered_at IS NOT NULL
                 AND ${COND_PROPIO}
                 AND so.product_name ILIKE 'samsung%'
                 AND (o.order_created_at AT TIME ZONE '${TZ_AR}')::date >= (now() AT TIME ZONE '${TZ_AR}')::date - 30
             )
             SELECT sku,
                    count(*) FILTER (WHERE fecha = hoy)::text AS hoy,
                    count(*) FILTER (WHERE fecha = hoy - 1)::text AS ayer,
                    count(*) FILTER (WHERE fecha >= hoy - 7)::text AS d7,
                    count(*)::text AS d30,
                    count(*) FILTER (WHERE fecha >= date_trunc('month', hoy)::date)::text AS mes
             FROM ventas
             GROUP BY sku
             ORDER BY d30 DESC`
          )
        : Promise.resolve({ rows: [] as { sku: string; hoy: string; ayer: string; d7: string; d30: string; mes: string }[] }),
    ])

    // Tortas y shares: fijo = jul-sep (junio queda solo como contexto del gráfico)
    const histRows = histRes.rows.map(r => ({ mes: r.mes, marca: r.marca, ventas: Number(r.ventas) }))
    const marcasFijo = agruparMarcas(histRows.filter(r => r.mes >= '2026-07'))
    const shareFijo = shareSamsung(marcasFijo)

    const actualRows = actualRes.rows.map(r => ({ marca: r.marca, ventas: Number(r.ventas) }))
    const marcasActual = agruparMarcas(actualRows)
    const muestraActual = {
      samsung: marcasActual.find(m => m.marca === 'Samsung')?.ventas ?? 0,
      conMarca: marcasActual.reduce((a, m) => a + m.ventas, 0),
      total: actualRows.reduce((a, r) => a + r.ventas, 0),
    }
    // Sin ventas todavía desde el 1/10, el escenario "con acuerdo" arranca igual al fijo
    const shareActual = muestraActual.conMarca > 0 ? shareSamsung(marcasActual) : shareFijo

    // Histórico mensual para el gráfico (total del mes + unidades Samsung)
    const porMesHist = new Map<string, { samsung: number; total: number }>()
    for (const r of histRows) {
      const fila = porMesHist.get(r.mes) ?? { samsung: 0, total: 0 }
      fila.total += r.ventas
      if (normalizarMarca(r.marca) === 'Samsung') fila.samsung += r.ventas
      porMesHist.set(r.mes, fila)
    }
    const historico = [...porMesHist.entries()]
      .map(([mes, v]) => ({ mes, ...v }))
      .sort((a, b) => a.mes.localeCompare(b.mes))

    // Proyección del último run congelado, ambos métodos
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
      .eq('nivel', canal)
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

    const skusSamsung = skuRes.rows.map(r => ({
      sku: r.sku,
      hoy: Number(r.hoy),
      ayer: Number(r.ayer),
      d7: Number(r.d7),
      d30: Number(r.d30),
      mes: Number(r.mes),
    }))

    return {
      canal,
      mesActual,
      runMes,
      shareFijo,
      shareActual,
      muestraActual,
      historico,
      marcasFijo,
      marcasActual,
      escenarios,
      ranking,
      skusSamsung,
    }
  } finally {
    client.release()
  }
}

// Los tres canales en paralelo para las píldoras del link (misma UX que
// /canales/proyeccion). El acuerdo aplica a venta propia; total y terceros
// son contexto.
export async function getDatosPartnerSamsungTodos(): Promise<Record<CanalPartner, DatosPartnerSamsung | null>> {
  const [total, propia, terceros] = await Promise.all([
    getDatosPartnerSamsung('total'),
    getDatosPartnerSamsung('propia'),
    getDatosPartnerSamsung('terceros'),
  ])
  return { total, propia, terceros }
}
