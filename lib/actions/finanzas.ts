'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getPool, getGocuotasPool } from '@/lib/db-pool'
import { CLIENT_IDS_PROPIOS, CLIENTES_TERCEROS, CLIENTES_TODOS, sqlCondicionClientes, condicionClientesNum, type FiltroClientes } from '@/lib/client-ids'
import { revalidatePath } from 'next/cache'
import { getPedidos, getMejorPrecio } from './compras'
import { buscarPrecio, diaHabilSiguiente } from '@/lib/utils'
import { armarFlujoPorCanal, type FlujoDiario, type FlujoPorCanal, type IncomeRow, type CuotasStats } from '@/lib/flujo-canal'
import { sqlFiltrosIndicadores, BLOQUEOS, type Bloqueo, type FiltrosIndicadoresSql } from '@/lib/bloqueo'
import { fetchSegmentoUserIds } from '@/lib/segmentos'
import { nombreMerchant, type StoreNombreRow } from '@/lib/merchant-nombre'

export type { FlujoDiario, FlujoPorCanal, CuotasStats }

// ---------------------------------------------------------------------------
// CRUD: flujo_asistencias (Supabase)
// ---------------------------------------------------------------------------

export async function agregarAsistencia(input: { fecha: string; monto: number }) {
  const supabase = createAdminClient()
  const { error } = await supabase.from('flujo_asistencias').insert({
    fecha: input.fecha,
    monto: input.monto,
  })
  if (error) return { error: error.message }
  revalidatePath('/finanzas')
  return { ok: true }
}

export async function editarAsistencia(id: string, input: { fecha: string; monto: number }) {
  const supabase = createAdminClient()
  const { error } = await supabase.from('flujo_asistencias').update({ fecha: input.fecha, monto: input.monto }).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/finanzas')
  return { ok: true }
}

export async function eliminarAsistencia(id: string) {
  const supabase = createAdminClient()
  const { error } = await supabase.from('flujo_asistencias').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/finanzas')
  return { ok: true }
}

// ---------------------------------------------------------------------------
// CRUD: flujo_egresos (Supabase)
// ---------------------------------------------------------------------------

export async function agregarEgreso(input: {
  flujo_dia: string
  concepto: string
  medio_de_pago: string
  cuotas: number
  monto: number
}) {
  const supabase = createAdminClient()
  const { error } = await supabase.from('flujo_egresos').insert({
    flujo_dia: input.flujo_dia,
    concepto: input.concepto,
    medio_de_pago: input.medio_de_pago,
    cuotas: input.cuotas,
    monto: input.monto,
  })
  if (error) return { error: error.message }
  revalidatePath('/finanzas')
  return { ok: true }
}

export async function editarEgreso(id: string, input: { flujo_dia: string; concepto: string; medio_de_pago: string; cuotas: number; monto: number }) {
  const supabase = createAdminClient()
  const { error } = await supabase.from('flujo_egresos').update({
    flujo_dia: input.flujo_dia, concepto: input.concepto, medio_de_pago: input.medio_de_pago, cuotas: input.cuotas, monto: input.monto,
  }).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/finanzas')
  return { ok: true }
}

export async function eliminarEgreso(id: string) {
  const supabase = createAdminClient()
  const { error } = await supabase.from('flujo_egresos').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/finanzas')
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Fetch raw data for manual entries display
// ---------------------------------------------------------------------------

export async function fetchAsistencias() {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('flujo_asistencias')
    .select('id, fecha, monto')
    .order('fecha', { ascending: false })
  if (error || !data) return []
  return data as { id: string; fecha: string; monto: number }[]
}

export async function fetchEgresos() {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('flujo_egresos')
    .select('id, flujo_dia, concepto, medio_de_pago, cuotas, monto')
    .order('flujo_dia', { ascending: false })
  if (error || !data) return []
  return data as { id: string; flujo_dia: string; concepto: string; medio_de_pago: string; cuotas: number; monto: number }[]
}

// ---------------------------------------------------------------------------
// fetchFlujoDeFondos – main aggregation
// ---------------------------------------------------------------------------

const CONCEPTO_COLUMNS: Record<string, keyof FlujoDiario> = {
  celulares: 'out_celulares',
  licencias: 'out_licencias',
  descartables: 'out_descartables',
  sueldos: 'out_sueldos',
  envios: 'out_envios',
  interes: 'out_interes',
}

function conceptoToColumn(concepto: string): keyof FlujoDiario {
  const key = concepto.toLowerCase().trim()
  return CONCEPTO_COLUMNS[key] ?? 'out_otros'
}

/** Add N calendar months to a YYYY-MM-DD string. */
function addMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr + 'T00:00:00')
  d.setMonth(d.getMonth() + months)
  return d.toISOString().slice(0, 10)
}

// ---- Data source fetchers -------------------------------------------------

// Los ingresos del flujo salen de la base DIRECTA de GOcuotas (no de la
// réplica de GOcelular) porque solo ahí están income_at (acreditación real)
// y expected_income_at. Imputación por fecha de acreditación (7 sep 2026,
// regla de Emiliano — las cuotas se cobran con ese delay y no debería haber
// ingresos en días no hábiles):
//   - Cobradas:   income_on (real) → expected_income_on → cobro + 2 hábiles
//     (income_on tarda unos días en estamparse tras el cobro)
//   - Pendientes: expected_income_on → vencimiento + 2 hábiles. Una cuota con
//     vencimiento pasado sigue pendiente mientras su acreditación esperada no
//     haya pasado (regla de Emiliano 8 sep 2026): el cobro del lunes se
//     registra en la base con 1-2 días de lag, así que "no cobrada ayer" no
//     es info firme hasta que la fecha de acreditación quedó atrás
//   - Vencidas:   al vencimiento, recién cuando la acreditación esperada ya
//     pasó sin cobro (solo se muestran, no suman al saldo)
// Universo de client_ids NUESTROS, dinámico: sale de la réplica de GOcelular
// (gocuotas_stores + gocuotas_orders), que solo contiene nuestros merchants y
// suma los nuevos sola. OJO: la base DIRECTA de GOcuotas es TODA la
// plataforma (19,5M de órdenes de comercios ajenos) — cualquier query ahí
// DEBE filtrar por este universo; un NOT IN propios a secas escanea todo
// GOcuotas (bug de prod 17 sep 2026: /finanzas tardaba minutos y moría).
async function fetchClientIdsUniverso(): Promise<string[]> {
  const pool = getPool()
  if (!pool) return CLIENT_IDS_PROPIOS
  const client = await pool.connect()
  try {
    const res = await client.query<{ client_id: string }>(`
      SELECT DISTINCT client_id FROM gocuotas_stores WHERE client_id IS NOT NULL
      UNION
      SELECT DISTINCT client_id::text FROM gocuotas_orders WHERE client_id IS NOT NULL
    `)
    const ids = new Set(CLIENT_IDS_PROPIOS)
    for (const r of res.rows) if (/^\d+$/.test(r.client_id)) ids.add(r.client_id)
    return [...ids]
  } finally {
    client.release()
  }
}

// UNA sola pasada con el canal como columna (es_propio) — el CASE del
// cash_date lleva un generate_series por cuota y es el query más caro de la
// página: correrlo dos veces en paralelo (una por canal) saturaba el pool de
// GOcuotas (max 3) y tiraba connect timeouts (bug de prod, 17 sep 2026)
async function fetchIncomePorCanalFromGocuotas(universo: string[]): Promise<{ propia: IncomeRow[]; terceros: IncomeRow[] }> {
  const vacio = { propia: [], terceros: [] }
  const pool = getGocuotasPool()
  if (!pool) return vacio

  const propiosNum = CLIENT_IDS_PROPIOS.map(Number).filter(n => Number.isFinite(n))
  const universoNum = universo.map(Number).filter(n => Number.isFinite(n))
  if (propiosNum.length === 0 || universoNum.length === 0) return vacio
  const placeholders = propiosNum.map((_, i) => `$${i + 1}`).join(',')
  const phUniverso = universoNum.map((_, i) => `$${propiosNum.length + i + 1}`).join(',')

  const client = await pool.connect()
  try {
    const res = await client.query<{
      cash_date: Date | string
      es_propio: boolean
      in_adelantado: string
      in_en_termino: string
      in_atrasado: string
      in_pendiente: string
      in_vencida: string
    }>(`
      WITH base AS (
        SELECT
          i.collected_at, i.collected_on, i.due_on, i.income_on, i.expected_income_on,
          i.discarded_at, i.amount_in_cents / 100.0 AS monto,
          o.client_id IN (${placeholders}) AS es_propio,
          COALESCE(
            i.expected_income_on,
            (SELECT d::date FROM generate_series(
               i.due_on + INTERVAL '1 day', i.due_on + INTERVAL '14 day', INTERVAL '1 day') AS d
             WHERE EXTRACT(DOW FROM d) NOT IN (0, 6) ORDER BY d OFFSET 1 LIMIT 1)
          ) AS acreditacion_esperada
        FROM installments i
        JOIN orders o ON o.id = i.order_id
        WHERE o.delivered_at IS NOT NULL
          AND o.discarded_at IS NULL
          AND o.client_id IN (${phUniverso})
      )
      SELECT
        CASE
          WHEN b.collected_at IS NOT NULL THEN COALESCE(
            b.income_on,
            b.expected_income_on,
            (SELECT d::date FROM generate_series(
               b.collected_on + INTERVAL '1 day', b.collected_on + INTERVAL '14 day', INTERVAL '1 day') AS d
             WHERE EXTRACT(DOW FROM d) NOT IN (0, 6) ORDER BY d OFFSET 1 LIMIT 1)
          )
          WHEN b.due_on >= CURRENT_DATE OR b.acreditacion_esperada >= CURRENT_DATE
            THEN b.acreditacion_esperada
          ELSE b.due_on
        END AS cash_date,
        b.es_propio,
        SUM(CASE WHEN b.collected_at IS NOT NULL AND b.collected_on < b.due_on THEN b.monto ELSE 0 END) AS in_adelantado,
        SUM(CASE WHEN b.collected_at IS NOT NULL AND b.collected_on = b.due_on THEN b.monto ELSE 0 END) AS in_en_termino,
        SUM(CASE WHEN b.collected_at IS NOT NULL AND b.collected_on > b.due_on THEN b.monto ELSE 0 END) AS in_atrasado,
        SUM(CASE WHEN b.collected_at IS NULL AND b.discarded_at IS NULL AND (b.due_on >= CURRENT_DATE OR b.acreditacion_esperada >= CURRENT_DATE) THEN b.monto ELSE 0 END) AS in_pendiente,
        SUM(CASE WHEN b.collected_at IS NULL AND b.discarded_at IS NULL AND b.due_on < CURRENT_DATE AND b.acreditacion_esperada < CURRENT_DATE THEN b.monto ELSE 0 END) AS in_vencida
      FROM base b
      GROUP BY 1, 2
    `, [...propiosNum, ...universoNum])
    const filas = res.rows
      .filter((r) => r.cash_date != null)
      .map((r) => ({
        es_propio: r.es_propio,
        row: {
          cash_date: r.cash_date instanceof Date ? r.cash_date.toISOString().slice(0, 10) : String(r.cash_date).slice(0, 10),
          in_adelantado: Number(r.in_adelantado),
          in_en_termino: Number(r.in_en_termino),
          in_atrasado: Number(r.in_atrasado),
          in_pendiente: Number(r.in_pendiente),
          in_vencida: Number(r.in_vencida),
        },
      }))
    return {
      propia: filas.filter(f => f.es_propio).map(f => f.row),
      terceros: filas.filter(f => !f.es_propio).map(f => f.row),
    }
  } finally {
    client.release()
  }
}

// Client IDs de terceros (importado desde lib/client-ids.ts)

async function fetchVta3eroFromGocuotas(tercerosIds: string[]): Promise<
  { cash_date: string; out_vta3ero: number }[]
> {
  const host = process.env.PG_GOCUOTAS_HOST
  const user = process.env.PG_GOCUOTAS_USER
  const pass = process.env.PG_GOCUOTAS_PASS
  const db = process.env.PG_GOCUOTAS_DB
  if (!host || !user || !pass || !db) return []

  const gocuotasPool = getGocuotasPool()
  if (!gocuotasPool) return []
  // Base DIRECTA de GOcuotas (toda la plataforma): SIEMPRE lista explícita
  // de NUESTROS merchants — un NOT IN acá sumaría liquidaciones de comercios
  // ajenos (y escanearía 19,5M de órdenes)
  const cond = condicionClientesNum(tercerosIds, 'client_id')
  if (!cond) return []

  const client = await gocuotasPool.connect()
  try {
    const res = await client.query<{ cash_date: Date; out_vta3ero: string }>(
      `SELECT due_expense_at::date AS cash_date,
              SUM(expense_amount_in_cents) / 100.0 AS out_vta3ero
       FROM orders
       WHERE due_expense_at IS NOT NULL
         AND expense_amount_in_cents > 0
         AND discarded_at IS NULL
         ${cond.clause}
       GROUP BY 1
       ORDER BY 1`,
      cond.values
    )
    return res.rows.map(r => ({
      cash_date: r.cash_date instanceof Date ? r.cash_date.toISOString().slice(0, 10) : String(r.cash_date),
      out_vta3ero: -Number(r.out_vta3ero), // negativo porque es un egreso
    }))
  } finally {
    client.release()
  }
}

async function fetchAsistenciasFromSupabase(): Promise<
  { cash_date: string; in_asistencia: number }[]
> {
  const supabase = createAdminClient()
  const { data, error } = await supabase.from('flujo_asistencias').select('fecha, monto')
  if (error || !data) return []
  return data.map((r: { fecha: string; monto: number }) => ({
    cash_date: r.fecha,
    in_asistencia: Number(r.monto),
  }))
}

async function fetchEgresosFromSupabase(): Promise<
  { cash_date: string; column: keyof FlujoDiario; amount: number }[]
> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('flujo_egresos')
    .select('flujo_dia, concepto, medio_de_pago, cuotas, monto')
  if (error || !data) return []

  const rows: { cash_date: string; column: keyof FlujoDiario; amount: number }[] = []

  for (const eg of data as {
    flujo_dia: string
    concepto: string
    medio_de_pago: string
    cuotas: number
    monto: number
  }[]) {
    const col = conceptoToColumn(eg.concepto)
    const isTarjeta = /tarjeta/i.test(eg.medio_de_pago)

    if (isTarjeta && eg.cuotas > 1) {
      const cuotaMonto = eg.monto / eg.cuotas
      for (let c = 0; c < eg.cuotas; c++) {
        const date = addMonths(eg.flujo_dia, c)
        rows.push({ cash_date: date, column: col, amount: -cuotaMonto })
      }
    } else {
      rows.push({ cash_date: eg.flujo_dia, column: col, amount: -eg.monto })
    }
  }

  return rows
}

// ---- Proyección de ingresos ------------------------------------------------

export async function getProyeccionDiaria(): Promise<number> {
  const supabase = createAdminClient()
  const { data } = await supabase.from('flujo_config').select('value').eq('key', 'proyeccion_diaria').single()
  return data ? Number(data.value) : 0
}

export async function setProyeccionDiaria(monto: number) {
  const supabase = createAdminClient()
  const { error } = await supabase.from('flujo_config').upsert({ key: 'proyeccion_diaria', value: String(monto), updated_at: new Date().toISOString() })
  if (error) return { error: error.message }
  revalidatePath('/finanzas')
  return { ok: true }
}

export async function getForecastEvents(): Promise<Record<string, number>> {
  const supabase = createAdminClient()
  const { data } = await supabase.from('flujo_config').select('value').eq('key', 'forecast_events').single()
  return data ? JSON.parse(data.value) : {}
}

export async function setForecastEvents(events: Record<string, number>) {
  const supabase = createAdminClient()
  const { error } = await supabase.from('flujo_config').upsert({ key: 'forecast_events', value: JSON.stringify(events), updated_at: new Date().toISOString() })
  if (error) return { error: error.message }
  revalidatePath('/dashboard')
  revalidatePath('/inventario')
  return { ok: true }
}

export async function getComprasDias(): Promise<number> {
  const supabase = createAdminClient()
  const { data } = await supabase.from('flujo_config').select('value').eq('key', 'compras_dias').single()
  return data ? Number(data.value) : 15
}

export async function setComprasDias(dias: number) {
  const supabase = createAdminClient()
  const { error } = await supabase.from('flujo_config').upsert({ key: 'compras_dias', value: String(dias), updated_at: new Date().toISOString() })
  if (error) return { error: error.message }
  revalidatePath('/inventario')
  return { ok: true }
}

// ---------------------------------------------------------------------------
// IVA: credito y debito fiscal mensual
// ---------------------------------------------------------------------------

export interface IVAMensual {
  periodo: string // YYYY-MM
  creditoFiscal: number
  debitoFiscal: number
  saldo: number // credito - debito (positivo = a favor)
}

export async function calcularIVAMensual(): Promise<IVAMensual[]> {
  const pedidos = await getPedidos()
  const precios = await getMejorPrecio()

  // Credito fiscal: agrupar por mes de entregadoAt (desde junio 2026 - cambio de naturaleza juridica)
  const IVA_DESDE = '2026-06'
  const creditoPorMes: Record<string, number> = {}
  for (const p of pedidos) {
    if (!p.entregadoAt) continue
    const mes = p.entregadoAt.slice(0, 7) // YYYY-MM
    if (mes < IVA_DESDE) continue
    if (!creditoPorMes[mes]) creditoPorMes[mes] = 0
    for (const item of p.items) {
      const precioUnit = buscarPrecio(precios, item.productoNombre)
      creditoPorMes[mes] += item.cantidad * precioUnit * 0.21
    }
  }

  // Debito fiscal: cuotas vencidas por mes desde GOcelular
  const pool = getPool()
  const debitoPorMes: Record<string, number> = {}
  if (pool) {
    try {
      const client = await pool.connect()
      try {
        const res = await client.query<{ mes: string; debito: string }>(`
          SELECT
            to_char(i.installment_due_at, 'YYYY-MM') AS mes,
            SUM(i.installment_amount - i.installment_amount / 1.21)::text AS debito
          FROM gocuotas_installments i
          JOIN gocuotas_orders go ON go.order_id::text = i.order_id::text
          WHERE go.order_discarded_at IS NULL
            AND i.installment_due_at IS NOT NULL
            AND go.order_created_at >= '2026-06-01'
          GROUP BY mes
          ORDER BY mes
        `)
        for (const r of res.rows) {
          debitoPorMes[r.mes] = Number(r.debito)
        }
      } finally {
        client.release()
      }
    } catch (e) {
      console.error('Error fetching IVA debito fiscal:', e)
    }
  }

  // Combinar periodos
  const allMeses = new Set([...Object.keys(creditoPorMes), ...Object.keys(debitoPorMes)])
  const result: IVAMensual[] = []
  for (const mes of allMeses) {
    const credito = creditoPorMes[mes] ?? 0
    const debito = debitoPorMes[mes] ?? 0
    result.push({ periodo: mes, creditoFiscal: credito, debitoFiscal: debito, saldo: credito - debito })
  }
  return result.sort((a, b) => a.periodo.localeCompare(b.periodo))
}

async function fetchPagosMayoristasParaFlujo(): Promise<{ cash_date: string; in_mayoristas: number }[]> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('pagos_mayoristas')
    .select('fecha_cobro, monto')

  if (error || !data) return []

  const byDate = new Map<string, number>()
  for (const row of data) {
    const date = row.fecha_cobro
    byDate.set(date, (byDate.get(date) || 0) + row.monto)
  }

  return Array.from(byDate.entries()).map(([cash_date, in_mayoristas]) => ({
    cash_date,
    in_mayoristas,
  }))
}

// ---- Main aggregation -----------------------------------------------------

// Las 3 variantes se arman con las mismas fuentes fetcheadas UNA vez: solo
// las cuotas (income) se piden por canal; el resto no tiene dimensión de
// canal y se afecta al flujo propio (regla de Emiliano, 17 sep 2026).
export async function fetchFlujoDeFondosPorCanal(): Promise<FlujoPorCanal> {
  // Universo dinámico de client_ids desde la réplica (merchants nuevos entran solos)
  const universo = await fetchClientIdsUniverso()
  const tercerosIds = universo.filter(id => !CLIENT_IDS_PROPIOS.includes(id))

  // 2 conexiones pico a GOcuotas (pool max 3): una para el income unificado,
  // otra para vta3ero — queda 1 libre para contracargos del resto de la página
  const [incomes, vta3ero] = await Promise.all([
    fetchIncomePorCanalFromGocuotas(universo),
    fetchVta3eroFromGocuotas(tercerosIds),
  ])
  const { propia: incomePropia, terceros: incomeTerceros } = incomes
  const [asistencias, egresos, proyeccionDiaria, pagosMayoristas] = await Promise.all([
    fetchAsistenciasFromSupabase(),
    fetchEgresosFromSupabase(),
    getProyeccionDiaria(),
    fetchPagosMayoristasParaFlujo(),
  ])

  return armarFlujoPorCanal({
    incomePropia,
    incomeTerceros,
    vta3ero,
    asistencias,
    egresos,
    pagosMayoristas,
    proyeccionDiaria,
  })
}

// ---------------------------------------------------------------------------
// fetchCuotasStats – installment payment status percentages
// ---------------------------------------------------------------------------

export async function fetchCuotasStats(clientes: FiltroClientes = CLIENTES_TODOS): Promise<CuotasStats> {
  const empty = { total: 0, adelantado: 0, en_termino: 0, atrasado: 0, mora: 0, contracargos: 0, pct_adelantado: 0, pct_en_termino: 0, pct_atrasado: 0, pct_mora: 0, pct_contracargos: 0, monto_adelantado: 0, monto_en_termino: 0, monto_atrasado: 0, monto_mora: 0, monto_contracargos: 0, ppp_recupero: 0, ppp_mora: 0 }
  const pool = getPool()
  if (!pool) return empty
  const condClientes = sqlCondicionClientes(clientes, 'o.client_id::text')
  if (!condClientes) return empty

  // Órdenes incobrables: contracargos ∪ equipos en transición 30+ días (dedup).
  // Sus cuotas salen de los buckets de mora y se castigan como incobrables.
  const { fetchOrderIdsConContracargo, fetchOrderIdsTransicion30d } = await import('@/lib/gocelular')
  const [cbOrderIds, transicionIds] = await Promise.all([
    fetchOrderIdsConContracargo().catch(() => [] as string[]),
    fetchOrderIdsTransicion30d().catch(() => [] as string[]),
  ])
  const cbSet = new Set(cbOrderIds)
  const incobrablesIds = [...new Set([...cbOrderIds, ...transicionIds])]
  const transicionSoloIds = transicionIds.filter(id => !cbSet.has(id))
  const cbOrderIdsList = incobrablesIds.length > 0 ? incobrablesIds.map(id => `'${id}'`).join(',') : "'0'"
  const transicionSoloList = transicionSoloIds.length > 0 ? transicionSoloIds.map(id => `'${id}'`).join(',') : "'0'"

  const client = await pool.connect()
  try {
    const res = await client.query<{
      total: string
      adelantado: string
      en_termino: string
      atrasado: string
      mora: string
      contracargos: string
      monto_adelantado: string
      monto_en_termino: string
      monto_atrasado: string
      monto_mora: string
      monto_contracargos: string
      ppp_recupero: string
      ppp_mora: string
    }>(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE i.installment_collected_at IS NOT NULL AND i.installment_collected_at::date < i.installment_due_at::date)::int AS adelantado,
        COUNT(*) FILTER (WHERE i.installment_collected_at IS NOT NULL AND i.installment_collected_at::date = i.installment_due_at::date)::int AS en_termino,
        COUNT(*) FILTER (WHERE i.installment_collected_at IS NOT NULL AND i.installment_collected_at::date > i.installment_due_at::date)::int AS atrasado,
        COUNT(*) FILTER (WHERE o.order_id::text NOT IN (${cbOrderIdsList}) AND i.installment_collected_at IS NULL AND i.installment_discarded_at IS NULL AND (CURRENT_DATE - i.installment_due_at::date) < 120)::int AS mora,
        (COUNT(*) FILTER (WHERE o.order_id::text IN (${cbOrderIdsList}))
         + COUNT(*) FILTER (WHERE o.order_id::text NOT IN (${cbOrderIdsList}) AND i.installment_collected_at IS NULL AND i.installment_discarded_at IS NULL AND (CURRENT_DATE - i.installment_due_at::date) >= 120)
        )::int AS contracargos,
        COALESCE(SUM(i.installment_amount) FILTER (WHERE o.order_id::text NOT IN (${cbOrderIdsList}) AND i.installment_collected_at IS NOT NULL AND i.installment_collected_at::date < i.installment_due_at::date), 0) AS monto_adelantado,
        COALESCE(SUM(i.installment_amount) FILTER (WHERE o.order_id::text NOT IN (${cbOrderIdsList}) AND i.installment_collected_at IS NOT NULL AND i.installment_collected_at::date = i.installment_due_at::date), 0) AS monto_en_termino,
        COALESCE(SUM(i.installment_amount) FILTER (WHERE o.order_id::text NOT IN (${cbOrderIdsList}) AND i.installment_collected_at IS NOT NULL AND i.installment_collected_at::date > i.installment_due_at::date), 0) AS monto_atrasado,
        COALESCE(SUM(i.installment_amount) FILTER (WHERE o.order_id::text NOT IN (${cbOrderIdsList}) AND i.installment_collected_at IS NULL AND i.installment_discarded_at IS NULL AND (CURRENT_DATE - i.installment_due_at::date) < 120), 0) AS monto_mora,
        (COALESCE(SUM(i.installment_amount) FILTER (WHERE o.order_id::text IN (${cbOrderIdsList})), 0)
         + COALESCE(SUM(i.installment_amount) FILTER (WHERE o.order_id::text NOT IN (${cbOrderIdsList}) AND i.installment_collected_at IS NULL AND i.installment_discarded_at IS NULL AND (CURRENT_DATE - i.installment_due_at::date) >= 120), 0)
        ) AS monto_contracargos,
        COALESCE(
          SUM(
            (i.installment_collected_at::date - i.installment_due_at::date) * i.installment_amount
          ) FILTER (WHERE i.installment_collected_at IS NOT NULL AND i.installment_collected_at::date > i.installment_due_at::date)
          /
          NULLIF(SUM(i.installment_amount) FILTER (WHERE i.installment_collected_at IS NOT NULL AND i.installment_collected_at::date > i.installment_due_at::date), 0),
          0
        ) AS ppp_recupero,
        COALESCE(
          SUM(
            (CURRENT_DATE - i.installment_due_at::date) * i.installment_amount
          ) FILTER (WHERE o.order_id::text NOT IN (${cbOrderIdsList}) AND i.installment_collected_at IS NULL AND i.installment_discarded_at IS NULL AND (CURRENT_DATE - i.installment_due_at::date) < 120)
          /
          NULLIF(SUM(i.installment_amount) FILTER (WHERE o.order_id::text NOT IN (${cbOrderIdsList}) AND i.installment_collected_at IS NULL AND i.installment_discarded_at IS NULL AND (CURRENT_DATE - i.installment_due_at::date) < 120), 0),
          0
        ) AS ppp_mora
      FROM gocuotas_installments i
      JOIN gocuotas_orders o ON o.order_id::text = i.order_id::text
      WHERE o.order_delivered_at IS NOT NULL
        AND o.order_discarded_at IS NULL
        AND ${condClientes}
        AND i.installment_due_at::date < CURRENT_DATE
    `)

    const row = res.rows[0]
    const total = Number(row.total) || 0
    const adelantado = Number(row.adelantado)
    const en_termino = Number(row.en_termino)
    const atrasado = Number(row.atrasado)
    const mora = Number(row.mora)
    const contracargos = Number(row.contracargos)

    // Get real chargeback order amounts from GOcuotas (monto total de la orden,
    // no cuotas), restringido a los clients del canal pedido
    const { fetchContracargos } = await import('@/lib/gocelular')
    const cbData = await fetchContracargos(clientes)
    const montoCBOrdenes = cbData.monto_contracargos // already in pesos, monto total de órdenes con CB
    const monto120Plus = Number(row.monto_contracargos) - (
      // monto_contracargos from SQL has both CB cuotas + 120+ cuotas
      // We need to subtract CB cuotas and keep only 120+ cuotas, then add real CB order amount
      0 // we'll recalculate below
    )

    // monto_contracargos from SQL = CB cuotas amount + 120+ non-CB cuotas amount
    // We need: real CB order amount (from GOcuotas) + 120+ non-CB cuotas amount
    // The 120+ part is already correct in the SQL, we just need to extract it
    // Query the 120+ part separately
    const mora120Res = await client.query<{ monto: string }>(`
      SELECT COALESCE(SUM(i.installment_amount), 0) AS monto
      FROM gocuotas_installments i
      JOIN gocuotas_orders o ON o.order_id::text = i.order_id::text
      WHERE o.order_delivered_at IS NOT NULL
        AND o.order_discarded_at IS NULL
        AND ${condClientes}
        AND o.order_id::text NOT IN (${cbOrderIdsList})
        AND i.installment_collected_at IS NULL
        AND i.installment_discarded_at IS NULL
        AND i.installment_due_at::date < CURRENT_DATE
        AND (CURRENT_DATE - i.installment_due_at::date) >= 120
    `)
    const montoMora120 = Number(mora120Res.rows[0].monto)

    // Equipos en transición 30+ días (sin contracargo, para no duplicar): se
    // castigan TODAS las cuotas pendientes de la orden, vencidas o no
    const transicionRes = await client.query<{ monto: string }>(`
      SELECT COALESCE(SUM(i.installment_amount), 0) AS monto
      FROM gocuotas_installments i
      JOIN gocuotas_orders o ON o.order_id::text = i.order_id::text
      WHERE i.order_id::text IN (${transicionSoloList})
        AND ${condClientes}
        AND i.installment_collected_at IS NULL
        AND i.installment_discarded_at IS NULL
    `)
    const montoTransicion = Number(transicionRes.rows[0].monto)
    const montoIncobrableTotal = montoCBOrdenes + montoMora120 + montoTransicion

    const pct = (n: number) => (total > 0 ? Math.round((n / total) * 10000) / 100 : 0)

    return {
      total, adelantado, en_termino, atrasado, mora, contracargos,
      pct_adelantado: pct(adelantado),
      pct_en_termino: pct(en_termino),
      pct_atrasado: pct(atrasado),
      pct_mora: pct(mora),
      pct_contracargos: pct(contracargos),
      monto_adelantado: Number(row.monto_adelantado),
      monto_en_termino: Number(row.monto_en_termino),
      monto_atrasado: Number(row.monto_atrasado),
      monto_mora: Number(row.monto_mora),
      monto_contracargos: montoIncobrableTotal,
      ppp_recupero: Math.round(Number(row.ppp_recupero)),
      ppp_mora: Math.round(Number(row.ppp_mora)),
    }
  } finally {
    client.release()
  }
}

// ---------------------------------------------------------------------------
// fetchEgresosStats – egreso breakdown by concepto and monthly pivot
// ---------------------------------------------------------------------------

export async function fetchEgresosStats(): Promise<{
  breakdown: { concepto: string; monto: number; porcentaje: number }[]
  mensual: {
    mes: string
    celulares: number
    licencias: number
    descartables: number
    sueldos: number
    envios: number
    interes: number
    otros: number
    vta3ero: number
  }[]
}> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('flujo_egresos')
    .select('flujo_dia, concepto, medio_de_pago, cuotas, monto')
  if (error || !data) return { breakdown: [], mensual: [] }

  // Expand tarjeta/cuotas into monthly installments
  const expanded: { mes: string; concepto: string; monto: number }[] = []

  for (const eg of data as {
    flujo_dia: string
    concepto: string
    medio_de_pago: string
    cuotas: number
    monto: number
  }[]) {
    const isTarjeta = /tarjeta/i.test(eg.medio_de_pago)
    const normalizedConcepto = eg.concepto.toLowerCase().trim()

    if (isTarjeta && eg.cuotas > 1) {
      const cuotaMonto = eg.monto / eg.cuotas
      for (let c = 0; c < eg.cuotas; c++) {
        const date = addMonths(eg.flujo_dia, c)
        const mes = date.slice(0, 7)
        expanded.push({ mes, concepto: normalizedConcepto, monto: Math.abs(cuotaMonto) })
      }
    } else {
      const mes = eg.flujo_dia.slice(0, 7)
      expanded.push({ mes, concepto: normalizedConcepto, monto: Math.abs(eg.monto) })
    }
  }

  // --- Breakdown by concepto ---
  const conceptoTotals = new Map<string, number>()
  let grandTotal = 0
  for (const r of expanded) {
    conceptoTotals.set(r.concepto, (conceptoTotals.get(r.concepto) ?? 0) + r.monto)
    grandTotal += r.monto
  }

  const breakdown = Array.from(conceptoTotals.entries())
    .map(([concepto, monto]) => ({
      concepto,
      monto: Math.round(monto * 100) / 100,
      porcentaje: grandTotal > 0 ? Math.round((monto / grandTotal) * 10000) / 100 : 0,
    }))
    .sort((a, b) => b.monto - a.monto)

  // --- Monthly pivot ---
  const CONCEPTO_PIVOT: Record<string, string> = {
    celulares: 'celulares',
    licencias: 'licencias',
    descartables: 'descartables',
    sueldos: 'sueldos',
    envios: 'envios',
    interes: 'interes',
    vta3ero: 'vta3ero',
    'vta terceros': 'vta3ero',
  }

  type MesRow = {
    mes: string
    celulares: number
    licencias: number
    descartables: number
    sueldos: number
    envios: number
    interes: number
    otros: number
    vta3ero: number
  }

  const mesMap = new Map<string, MesRow>()

  function getOrCreateMes(mes: string): MesRow {
    let row = mesMap.get(mes)
    if (!row) {
      row = { mes, celulares: 0, licencias: 0, descartables: 0, sueldos: 0, envios: 0, interes: 0, otros: 0, vta3ero: 0 }
      mesMap.set(mes, row)
    }
    return row
  }

  for (const r of expanded) {
    const row = getOrCreateMes(r.mes)
    const pivotKey = CONCEPTO_PIVOT[r.concepto] ?? 'otros'
    ;(row as unknown as Record<string, number>)[pivotKey] += r.monto
  }

  const mensual = Array.from(mesMap.values())
    .sort((a, b) => a.mes.localeCompare(b.mes))
    .map((r) => ({
      ...r,
      celulares: Math.round(r.celulares * 100) / 100,
      licencias: Math.round(r.licencias * 100) / 100,
      descartables: Math.round(r.descartables * 100) / 100,
      sueldos: Math.round(r.sueldos * 100) / 100,
      envios: Math.round(r.envios * 100) / 100,
      interes: Math.round(r.interes * 100) / 100,
      otros: Math.round(r.otros * 100) / 100,
      vta3ero: Math.round(r.vta3ero * 100) / 100,
    }))

  return { breakdown, mensual }
}

// ---------------------------------------------------------------------------
// fetchDPDIndicadores – Days Past Due buckets by origination & due month
// ---------------------------------------------------------------------------

interface DPDRow {
  mes: string // YYYY-MM
  dpd_1_7_pct: number
  dpd_1_7_monto: number
  dpd_8_30_pct: number
  dpd_8_30_monto: number
  dpd_31_60_pct: number
  dpd_31_60_monto: number
  dpd_60_plus_pct: number
  dpd_60_plus_monto: number
  incobrable_pct: number
  incobrable_monto: number
  total_vencido: number
}

export async function fetchDPDIndicadores(clientes: FiltroClientes = CLIENTES_TODOS, filtros?: FiltrosIndicadoresSql): Promise<{
  byOrigination: DPDRow[]
  byDueMonth: DPDRow[]
}> {
  const empty = { byOrigination: [], byDueMonth: [] }
  const pool = getPool()
  if (!pool) return empty
  const condClientes = sqlCondicionClientes(clientes, 'o.client_id::text')
  if (!condClientes) return empty
  const extra = sqlFiltrosIndicadores(filtros)

  // Órdenes incobrables (contracargos ∪ transición 30d): sus cuotas vencidas
  // salen de los buckets por días y van a la columna Incobrable, sin duplicar
  const { fetchOrdenesIncobrables } = await import('@/lib/gocelular')
  const incobrablesIds = await fetchOrdenesIncobrables().catch(() => [] as string[])
  const incobrablesList = incobrablesIds.length > 0 ? incobrablesIds.map(id => `'${id}'`).join(',') : "'0'"

  const baseQuery = (mesExpr: string) => `
    SELECT
      ${mesExpr} AS mes,
      SUM(CASE WHEN i.installment_due_at::date < CURRENT_DATE THEN i.installment_amount ELSE 0 END) AS total_vencido,
      SUM(CASE WHEN i.installment_collected_at IS NULL AND i.installment_discarded_at IS NULL
        AND o.order_id::text NOT IN (${incobrablesList})
        AND i.installment_due_at::date < CURRENT_DATE
        AND (CURRENT_DATE - i.installment_due_at::date) BETWEEN 1 AND 7
        THEN i.installment_amount ELSE 0 END) AS dpd_1_7,
      SUM(CASE WHEN i.installment_collected_at IS NULL AND i.installment_discarded_at IS NULL
        AND o.order_id::text NOT IN (${incobrablesList})
        AND i.installment_due_at::date < CURRENT_DATE
        AND (CURRENT_DATE - i.installment_due_at::date) BETWEEN 8 AND 30
        THEN i.installment_amount ELSE 0 END) AS dpd_8_30,
      SUM(CASE WHEN i.installment_collected_at IS NULL AND i.installment_discarded_at IS NULL
        AND o.order_id::text NOT IN (${incobrablesList})
        AND i.installment_due_at::date < CURRENT_DATE
        AND (CURRENT_DATE - i.installment_due_at::date) BETWEEN 31 AND 60
        THEN i.installment_amount ELSE 0 END) AS dpd_31_60,
      SUM(CASE WHEN i.installment_collected_at IS NULL AND i.installment_discarded_at IS NULL
        AND o.order_id::text NOT IN (${incobrablesList})
        AND i.installment_due_at::date < CURRENT_DATE
        AND (CURRENT_DATE - i.installment_due_at::date) > 60
        THEN i.installment_amount ELSE 0 END) AS dpd_60_plus,
      SUM(CASE WHEN i.installment_collected_at IS NULL AND i.installment_discarded_at IS NULL
        AND o.order_id::text IN (${incobrablesList})
        AND i.installment_due_at::date < CURRENT_DATE
        THEN i.installment_amount ELSE 0 END) AS dpd_incobrable
    FROM gocuotas_installments i
    JOIN gocuotas_orders o ON o.order_id::text = i.order_id::text
    ${extra.join}
    WHERE o.order_delivered_at IS NOT NULL
      AND o.order_discarded_at IS NULL
      AND ${condClientes}
      ${extra.where}
    GROUP BY 1
    ORDER BY 1
  `

  const client = await pool.connect()
  try {
    type QRow = {
      mes: Date | string
      total_vencido: string
      dpd_1_7: string
      dpd_8_30: string
      dpd_31_60: string
      dpd_60_plus: string
      dpd_incobrable: string
    }

    const [resOrig, resDue] = await Promise.all([
      client.query<QRow>(baseQuery("to_char(o.order_delivered_at, 'YYYY-MM')")),
      client.query<QRow>(baseQuery("to_char(i.installment_due_at, 'YYYY-MM')")),
    ])

    function parseRows(rows: QRow[]): DPDRow[] {
      return rows
        .filter((r) => r.mes != null)
        .map((r) => {
          const total = Number(r.total_vencido)
          const d17 = Number(r.dpd_1_7)
          const d830 = Number(r.dpd_8_30)
          const d3160 = Number(r.dpd_31_60)
          const d60p = Number(r.dpd_60_plus)
          const dInc = Number(r.dpd_incobrable)
          const pct = (n: number) => (total === 0 ? 0 : Math.round((n / total * 100) * 100) / 100)
          return {
            mes: r.mes instanceof Date ? r.mes.toISOString().slice(0, 7) : String(r.mes).slice(0, 7),
            dpd_1_7_pct: pct(d17),
            dpd_1_7_monto: d17,
            dpd_8_30_pct: pct(d830),
            dpd_8_30_monto: d830,
            dpd_31_60_pct: pct(d3160),
            dpd_31_60_monto: d3160,
            dpd_60_plus_pct: pct(d60p),
            dpd_60_plus_monto: d60p,
            incobrable_pct: pct(dInc),
            incobrable_monto: dInc,
            total_vencido: total,
          }
        })
    }

    return {
      byOrigination: parseRows(resOrig.rows),
      byDueMonth: parseRows(resDue.rows),
    }
  } finally {
    client.release()
  }
}

// ---------------------------------------------------------------------------
// fetchPDIndicadores – PD Hard & PD30 by origination month and due month
// ---------------------------------------------------------------------------

interface PDRow {
  mes: string // YYYY-MM
  cuota: number
  pd_hard: number // percentage
  pd_30: number // percentage
}

interface PDResumen {
  cuota: number
  pd_hard: number
  pd_30: number
}

export async function fetchPDIndicadores(clientes: FiltroClientes = CLIENTES_TODOS, filtros?: FiltrosIndicadoresSql): Promise<{
  byOrigination: PDRow[]
  byDueMonth: PDRow[]
  resumen: PDResumen[]
  maxCuota: number
}> {
  const empty = { byOrigination: [], byDueMonth: [], resumen: [], maxCuota: 0 }
  const condClientes = sqlCondicionClientes(clientes, 'o.client_id::text')
  if (!condClientes) return empty
  const pool = getPool()
  if (!pool) return empty

  const extra = sqlFiltrosIndicadores(filtros)

  const baseQuery = (mesExpr: string) => `
    SELECT
      ${mesExpr} AS mes,
      i.installment_number AS cuota,
      SUM(CASE WHEN i.installment_due_at::date < CURRENT_DATE THEN i.installment_amount ELSE 0 END) AS den_hard,
      SUM(CASE WHEN i.installment_due_at::date < CURRENT_DATE
        AND (
          (i.installment_collected_at IS NULL AND i.installment_discarded_at IS NULL)
          OR i.installment_collected_at::date > i.installment_due_at::date + 1
        ) THEN i.installment_amount ELSE 0 END) AS num_hard,
      SUM(CASE WHEN i.installment_due_at::date < CURRENT_DATE - 30 THEN i.installment_amount ELSE 0 END) AS den_30,
      SUM(CASE WHEN i.installment_due_at::date < CURRENT_DATE - 30
        AND (
          (i.installment_collected_at IS NULL AND i.installment_discarded_at IS NULL)
          OR i.installment_collected_at::date > i.installment_due_at::date + 30
        ) THEN i.installment_amount ELSE 0 END) AS num_30
    FROM gocuotas_installments i
    JOIN gocuotas_orders o ON o.order_id::text = i.order_id::text
    ${extra.join}
    WHERE o.order_delivered_at IS NOT NULL
      AND o.order_discarded_at IS NULL
      AND ${condClientes}
      ${extra.where}
    GROUP BY 1, 2
    ORDER BY 1, 2
  `

  const client = await pool.connect()
  try {
    type QRow = { mes: Date | string; cuota: string; den_hard: string; num_hard: string; den_30: string; num_30: string }

    const [resOrig, resDue, resTotal] = await Promise.all([
      client.query<QRow>(baseQuery("to_char(o.order_delivered_at, 'YYYY-MM')")),
      client.query<QRow>(baseQuery("to_char(i.installment_due_at, 'YYYY-MM')")),
      client.query<{ cuota: string; den_hard: string; num_hard: string; den_30: string; num_30: string }>(`
        SELECT
          i.installment_number AS cuota,
          SUM(CASE WHEN i.installment_due_at::date < CURRENT_DATE THEN i.installment_amount ELSE 0 END) AS den_hard,
          SUM(CASE WHEN i.installment_due_at::date < CURRENT_DATE
            AND (
              (i.installment_collected_at IS NULL AND i.installment_discarded_at IS NULL)
              OR i.installment_collected_at::date > i.installment_due_at::date + 1
            ) THEN i.installment_amount ELSE 0 END) AS num_hard,
          SUM(CASE WHEN i.installment_due_at::date < CURRENT_DATE - 30 THEN i.installment_amount ELSE 0 END) AS den_30,
          SUM(CASE WHEN i.installment_due_at::date < CURRENT_DATE - 30
            AND (
              (i.installment_collected_at IS NULL AND i.installment_discarded_at IS NULL)
              OR i.installment_collected_at::date > i.installment_due_at::date + 30
            ) THEN i.installment_amount ELSE 0 END) AS num_30
        FROM gocuotas_installments i
        JOIN gocuotas_orders o ON o.order_id::text = i.order_id::text
        ${extra.join}
        WHERE o.order_delivered_at IS NOT NULL
          AND o.order_discarded_at IS NULL
          AND ${condClientes}
          ${extra.where}
        GROUP BY 1
        ORDER BY 1
      `),
    ])

    function parseRows(rows: { mes: Date | string; cuota: string; den_hard: string; num_hard: string; den_30: string; num_30: string }[]): PDRow[] {
      return rows
        .filter((r) => r.mes != null)
        .map((r) => {
          const denHard = Number(r.den_hard)
          const numHard = Number(r.num_hard)
          const den30 = Number(r.den_30)
          const num30 = Number(r.num_30)
          return {
            mes: r.mes instanceof Date ? r.mes.toISOString().slice(0, 7) : String(r.mes).slice(0, 7),
            cuota: Number(r.cuota),
            pd_hard: denHard === 0 ? 0 : Math.round((100 * numHard / denHard) * 100) / 100,
            pd_30: den30 === 0 ? 0 : Math.round((100 * num30 / den30) * 100) / 100,
          }
        })
    }

    const byOrigination = parseRows(resOrig.rows)
    const byDueMonth = parseRows(resDue.rows)

    const resumen: PDResumen[] = resTotal.rows.map((r) => {
      const denHard = Number(r.den_hard)
      const numHard = Number(r.num_hard)
      const den30 = Number(r.den_30)
      const num30 = Number(r.num_30)
      return {
        cuota: Number(r.cuota),
        pd_hard: denHard === 0 ? 0 : Math.round((100 * numHard / denHard) * 100) / 100,
        pd_30: den30 === 0 ? 0 : Math.round((100 * num30 / den30) * 100) / 100,
      }
    })

    let maxCuota = 0
    for (const r of byOrigination) { if (r.cuota > maxCuota) maxCuota = r.cuota }
    for (const r of byDueMonth) { if (r.cuota > maxCuota) maxCuota = r.cuota }
    for (const r of resumen) { if (r.cuota > maxCuota) maxCuota = r.cuota }

    return { byOrigination, byDueMonth, resumen, maxCuota }
  } finally {
    client.release()
  }
}

// ---------------------------------------------------------------------------
// fetchVintageAnalysis – Vintage analysis by origination month
// ---------------------------------------------------------------------------

export interface VintageRow {
  origination_month: string // YYYY-MM
  amt_total: number
  amt_por_vencer: number
  amt_cobrada_en_termino: number
  amt_mora_1_29: number
  amt_mora_30_59: number
  amt_mora_60_89: number
  amt_mora_90_119: number
  amt_incobrable_120_plus: number
  amt_recupero_1_29: number
  amt_recupero_30_59: number
  amt_recupero_60_89: number
  amt_recupero_90_119: number
  amt_recupero_120_plus: number
  pct_por_vencer: number
  pct_cobrada_en_termino: number
  pct_mora_1_29: number
  pct_mora_30_59: number
  pct_mora_60_89: number
  pct_mora_90_119: number
  pct_incobrable_120_plus: number
  pct_recupero_1_29: number
  pct_recupero_30_59: number
  pct_recupero_60_89: number
  pct_recupero_90_119: number
  pct_recupero_120_plus: number
}

export async function fetchVintageAnalysis(clientes: FiltroClientes = CLIENTES_TODOS, filtros?: FiltrosIndicadoresSql): Promise<VintageRow[]> {
  const condClientes = sqlCondicionClientes(clientes, 'o.client_id::text')
  if (!condClientes) return []
  const pool = getPool()
  if (!pool) return []

  const extra = sqlFiltrosIndicadores(filtros)

  // Órdenes incobrables: contracargos (orden completa) + equipos en transición
  // 30+ días (solo sus cuotas pendientes — las cobradas ya entraron)
  const { fetchOrderIdsConContracargo, fetchOrderIdsTransicion30d } = await import('@/lib/gocelular')
  const [cbOrderIds, transicionIds] = await Promise.all([
    fetchOrderIdsConContracargo().catch(() => [] as string[]),
    fetchOrderIdsTransicion30d().catch(() => [] as string[]),
  ])
  const cbOrderIdsList = cbOrderIds.length > 0 ? cbOrderIds.map(id => `'${id}'`).join(',') : "'0'"
  const transicionList = transicionIds.length > 0 ? transicionIds.map(id => `'${id}'`).join(',') : "'0'"

  const client = await pool.connect()
  try {
    const res = await client.query<{
      origination_month: Date | string
      amt_total: string
      amt_por_vencer: string
      amt_cobrada_en_termino: string
      amt_mora_1_29: string
      amt_mora_30_59: string
      amt_mora_60_89: string
      amt_mora_90_119: string
      amt_incobrable_120_plus: string
      amt_recupero_1_29: string
      amt_recupero_30_59: string
      amt_recupero_60_89: string
      amt_recupero_90_119: string
      amt_recupero_120_plus: string
    }>(`
      WITH base AS (
        SELECT
          date_trunc('month', o.order_created_at)::date AS origination_month,
          i.installment_due_at::date AS due_date,
          i.installment_collected_at::date AS collected_date,
          i.installment_amount AS amount,
          (CURRENT_DATE - i.installment_due_at::date) AS days_past_due,
          CASE
            WHEN i.installment_collected_at IS NOT NULL
              THEN (i.installment_collected_at::date - i.installment_due_at::date)
            ELSE NULL
          END AS days_late_paid,
          CASE WHEN o.order_id::text IN (${cbOrderIdsList}) THEN true ELSE false END AS tiene_contracargo,
          CASE WHEN o.order_id::text IN (${transicionList}) THEN true ELSE false END AS tiene_transicion
        FROM gocuotas_installments i
        JOIN gocuotas_orders o ON o.order_id::text = i.order_id::text
        ${extra.join}
        WHERE o.order_delivered_at IS NOT NULL
          AND o.order_discarded_at IS NULL
          AND ${condClientes}
          ${extra.where}
      ),
      classified AS (
        SELECT
          origination_month,
          amount,
          CASE
            WHEN tiene_contracargo THEN 'INCOBRABLE_120_PLUS'
            WHEN collected_date IS NOT NULL AND collected_date <= due_date THEN 'COBRADA_EN_TERMINO'
            WHEN collected_date IS NOT NULL AND days_late_paid BETWEEN 1 AND 29 THEN 'RECUPERO_1_29'
            WHEN collected_date IS NOT NULL AND days_late_paid BETWEEN 30 AND 59 THEN 'RECUPERO_30_59'
            WHEN collected_date IS NOT NULL AND days_late_paid BETWEEN 60 AND 89 THEN 'RECUPERO_60_89'
            WHEN collected_date IS NOT NULL AND days_late_paid BETWEEN 90 AND 119 THEN 'RECUPERO_90_119'
            WHEN collected_date IS NOT NULL AND days_late_paid >= 120 THEN 'RECUPERO_120_PLUS'
            WHEN tiene_transicion AND collected_date IS NULL THEN 'INCOBRABLE_120_PLUS'
            WHEN collected_date IS NULL AND due_date >= CURRENT_DATE THEN 'POR_VENCER'
            WHEN collected_date IS NULL AND due_date < CURRENT_DATE AND days_past_due BETWEEN 1 AND 29 THEN 'MORA_1_29'
            WHEN collected_date IS NULL AND due_date < CURRENT_DATE AND days_past_due BETWEEN 30 AND 59 THEN 'MORA_30_59'
            WHEN collected_date IS NULL AND due_date < CURRENT_DATE AND days_past_due BETWEEN 60 AND 89 THEN 'MORA_60_89'
            WHEN collected_date IS NULL AND due_date < CURRENT_DATE AND days_past_due BETWEEN 90 AND 119 THEN 'MORA_90_119'
            WHEN collected_date IS NULL AND due_date < CURRENT_DATE AND days_past_due >= 120 THEN 'INCOBRABLE_120_PLUS'
            ELSE 'OTRO'
          END AS bucket
        FROM base
      ),
      agg AS (
        SELECT
          origination_month,
          SUM(amount) AS amt_total,
          COALESCE(SUM(amount) FILTER (WHERE bucket = 'POR_VENCER'), 0) AS amt_por_vencer,
          COALESCE(SUM(amount) FILTER (WHERE bucket = 'COBRADA_EN_TERMINO'), 0) AS amt_cobrada_en_termino,
          COALESCE(SUM(amount) FILTER (WHERE bucket = 'MORA_1_29'), 0) AS amt_mora_1_29,
          COALESCE(SUM(amount) FILTER (WHERE bucket = 'MORA_30_59'), 0) AS amt_mora_30_59,
          COALESCE(SUM(amount) FILTER (WHERE bucket = 'MORA_60_89'), 0) AS amt_mora_60_89,
          COALESCE(SUM(amount) FILTER (WHERE bucket = 'MORA_90_119'), 0) AS amt_mora_90_119,
          COALESCE(SUM(amount) FILTER (WHERE bucket = 'INCOBRABLE_120_PLUS'), 0) AS amt_incobrable_120_plus,
          COALESCE(SUM(amount) FILTER (WHERE bucket = 'RECUPERO_1_29'), 0) AS amt_recupero_1_29,
          COALESCE(SUM(amount) FILTER (WHERE bucket = 'RECUPERO_30_59'), 0) AS amt_recupero_30_59,
          COALESCE(SUM(amount) FILTER (WHERE bucket = 'RECUPERO_60_89'), 0) AS amt_recupero_60_89,
          COALESCE(SUM(amount) FILTER (WHERE bucket = 'RECUPERO_90_119'), 0) AS amt_recupero_90_119,
          COALESCE(SUM(amount) FILTER (WHERE bucket = 'RECUPERO_120_PLUS'), 0) AS amt_recupero_120_plus
        FROM classified
        GROUP BY 1
      )
      SELECT * FROM agg ORDER BY origination_month
    `)

    return res.rows
      .filter((r) => r.origination_month != null)
      .map((r) => {
        const total = Number(r.amt_total)
        const pct = (n: number) => (total === 0 ? 0 : Math.round((n / total * 100) * 100) / 100)

        const amt_por_vencer = Number(r.amt_por_vencer)
        const amt_cobrada_en_termino = Number(r.amt_cobrada_en_termino)
        const amt_mora_1_29 = Number(r.amt_mora_1_29)
        const amt_mora_30_59 = Number(r.amt_mora_30_59)
        const amt_mora_60_89 = Number(r.amt_mora_60_89)
        const amt_mora_90_119 = Number(r.amt_mora_90_119)
        const amt_incobrable_120_plus = Number(r.amt_incobrable_120_plus)
        const amt_recupero_1_29 = Number(r.amt_recupero_1_29)
        const amt_recupero_30_59 = Number(r.amt_recupero_30_59)
        const amt_recupero_60_89 = Number(r.amt_recupero_60_89)
        const amt_recupero_90_119 = Number(r.amt_recupero_90_119)
        const amt_recupero_120_plus = Number(r.amt_recupero_120_plus)

        return {
          origination_month: r.origination_month instanceof Date
            ? r.origination_month.toISOString().slice(0, 7)
            : String(r.origination_month).slice(0, 7),
          amt_total: total,
          amt_por_vencer,
          amt_cobrada_en_termino,
          amt_mora_1_29,
          amt_mora_30_59,
          amt_mora_60_89,
          amt_mora_90_119,
          amt_incobrable_120_plus,
          amt_recupero_1_29,
          amt_recupero_30_59,
          amt_recupero_60_89,
          amt_recupero_90_119,
          amt_recupero_120_plus,
          pct_por_vencer: pct(amt_por_vencer),
          pct_cobrada_en_termino: pct(amt_cobrada_en_termino),
          pct_mora_1_29: pct(amt_mora_1_29),
          pct_mora_30_59: pct(amt_mora_30_59),
          pct_mora_60_89: pct(amt_mora_60_89),
          pct_mora_90_119: pct(amt_mora_90_119),
          pct_incobrable_120_plus: pct(amt_incobrable_120_plus),
          pct_recupero_1_29: pct(amt_recupero_1_29),
          pct_recupero_30_59: pct(amt_recupero_30_59),
          pct_recupero_60_89: pct(amt_recupero_60_89),
          pct_recupero_90_119: pct(amt_recupero_90_119),
          pct_recupero_120_plus: pct(amt_recupero_120_plus),
        }
      })
  } finally {
    client.release()
  }
}

// ---------------------------------------------------------------------------
// Filtros on-demand de PD/DPD/Vintage (bloqueo Knox/Motosafe/DLC + store)
// ---------------------------------------------------------------------------
// Las combinaciones canal × bloqueo × merchant × store no se pueden precomputar
// (explotan el pool): los tabs llaman estas actions al elegir un filtro
// no-default y cachean el resultado en memoria del cliente.

export interface FiltroIndicadores {
  canal: 'total' | 'propia' | 'terceros'
  bloqueo?: Bloqueo
  merchantId?: string // client_id del merchant tercero
  storeId?: string // gocuotas store_id
  segmentoLetra?: string // 'A'..'D' — límite del cliente en tickets promedio
  segmentoNumero?: string // '1'..'4' — antigüedad desde la activación
}

async function resolverFiltro(f: FiltroIndicadores): Promise<{ clientes: FiltroClientes; filtros: FiltrosIndicadoresSql }> {
  // Regla de canales: propios explícitos, terceros = todo lo que no es propio
  let clientes: FiltroClientes =
    f.canal === 'propia' ? CLIENT_IDS_PROPIOS : f.canal === 'terceros' ? CLIENTES_TERCEROS : CLIENTES_TODOS
  if (f.canal === 'terceros' && f.merchantId && /^\d+$/.test(f.merchantId) && !CLIENT_IDS_PROPIOS.includes(f.merchantId)) {
    clientes = [f.merchantId]
  }
  const bloqueo = f.bloqueo && (BLOQUEOS as readonly string[]).includes(f.bloqueo) ? f.bloqueo : undefined
  const storeIds = f.canal === 'terceros' && f.storeId ? [f.storeId] : undefined
  const hayFiltroSegmento =
    (f.segmentoLetra && /^[A-D]$/.test(f.segmentoLetra)) || (f.segmentoNumero && /^[1-4]$/.test(f.segmentoNumero))
  const segmentoUserIds = hayFiltroSegmento
    ? await fetchSegmentoUserIds(f.segmentoLetra, f.segmentoNumero)
    : undefined
  return { clientes, filtros: { bloqueo, storeIds, segmentoUserIds } }
}

export async function fetchPDFiltrado(f: FiltroIndicadores) {
  const { clientes, filtros } = await resolverFiltro(f)
  return fetchPDIndicadores(clientes, filtros)
}

export async function fetchDPDFiltrado(f: FiltroIndicadores) {
  const { clientes, filtros } = await resolverFiltro(f)
  return fetchDPDIndicadores(clientes, filtros)
}

export async function fetchVintageFiltrado(f: FiltroIndicadores) {
  const { clientes, filtros } = await resolverFiltro(f)
  return fetchVintageAnalysis(clientes, filtros)
}

// ---------------------------------------------------------------------------
// Merchants y stores de terceros para los desplegables de PD/DPD/Vintage
// ---------------------------------------------------------------------------

export interface MerchantTercero {
  clientId: string
  nombre: string
  stores: { id: string; nombre: string }[]
}

export async function getFiltrosTerceros(): Promise<MerchantTercero[]> {
  const pool = getPool()
  if (!pool) return []

  // Todos los merchants por exclusión: cualquier client_id no propio es un
  // tercero — los merchants nuevos aparecen solos en el desplegable
  const condClientes = sqlCondicionClientes(CLIENTES_TERCEROS, 'client_id')
  if (!condClientes) return []

  const client = await pool.connect()
  try {
    const res = await client.query<{
      client_id: string
      gocuotas_store_id: string
      store_name: string
      merchant_name: string | null
      updated_at: Date | string
    }>(`
      SELECT client_id, gocuotas_store_id, store_name, merchant_name, updated_at
      FROM gocuotas_stores
      WHERE client_id IS NOT NULL AND ${condClientes}
      ORDER BY store_name
    `)

    const porClient = new Map<string, typeof res.rows>()
    for (const r of res.rows) {
      const arr = porClient.get(r.client_id) ?? []
      arr.push(r)
      porClient.set(r.client_id, arr)
    }

    const out: MerchantTercero[] = []
    for (const [clientId, rows] of porClient) {
      const nombreRows: StoreNombreRow[] = rows.map(r => ({
        merchantName: r.merchant_name,
        storeName: r.store_name,
        updatedAt: String(r.updated_at),
      }))
      out.push({
        clientId,
        nombre: nombreMerchant(nombreRows) ?? `Cliente ${clientId}`,
        stores: rows.map(r => ({ id: r.gocuotas_store_id, nombre: r.store_name })),
      })
    }
    return out.sort((a, b) => a.nombre.localeCompare(b.nombre))
  } finally {
    client.release()
  }
}
