'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { Client } from 'pg'
import { revalidatePath } from 'next/cache'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FlujoDiario {
  cash_date: string
  in_adelantado: number
  in_en_termino: number
  in_atrasado: number
  in_pendiente: number
  in_vencida: number
  in_asistencia: number
  in_proyectado: number
  out_celulares: number
  out_licencias: number
  out_descartables: number
  out_sueldos: number
  out_envios: number
  out_interes: number
  out_otros: number
  out_vta3ero: number
  net_flow: number
  cash_balance: number
}

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

function emptyRow(cash_date: string): FlujoDiario {
  return {
    cash_date,
    in_adelantado: 0,
    in_en_termino: 0,
    in_atrasado: 0,
    in_pendiente: 0,
    in_vencida: 0,
    in_asistencia: 0,
    in_proyectado: 0,
    out_celulares: 0,
    out_licencias: 0,
    out_descartables: 0,
    out_sueldos: 0,
    out_envios: 0,
    out_interes: 0,
    out_otros: 0,
    out_vta3ero: 0,
    net_flow: 0,
    cash_balance: 0,
  }
}

function getOrCreate(map: Map<string, FlujoDiario>, date: string): FlujoDiario {
  let row = map.get(date)
  if (!row) {
    row = emptyRow(date)
    map.set(date, row)
  }
  return row
}

// ---- Data source fetchers -------------------------------------------------

async function fetchIncomeFromGocelular(): Promise<
  { cash_date: string; in_adelantado: number; in_en_termino: number; in_atrasado: number; in_pendiente: number; in_vencida: number }[]
> {
  const url = process.env.GOCELULAR_DB_URL
  if (!url) return []

  const client = new Client({ connectionString: url })
  await client.connect()
  try {
    const res = await client.query<{
      cash_date: Date | string
      in_adelantado: string
      in_en_termino: string
      in_atrasado: string
      in_pendiente: string
      in_vencida: string
    }>(`
      SELECT
        CASE
          WHEN i.installment_collected_at IS NOT NULL THEN (
            SELECT d::date
            FROM generate_series(
              (i.installment_collected_at::date + INTERVAL '1 day'),
              (i.installment_collected_at::date + INTERVAL '14 day'),
              INTERVAL '1 day'
            ) AS d
            WHERE EXTRACT(DOW FROM d) NOT IN (0, 6)
            ORDER BY d
            OFFSET 1
            LIMIT 1
          )
          ELSE i.installment_due_at::date
        END AS cash_date,
        SUM(CASE WHEN i.installment_collected_at IS NOT NULL AND i.installment_collected_at::date < i.installment_due_at::date THEN i.installment_amount ELSE 0 END) AS in_adelantado,
        SUM(CASE WHEN i.installment_collected_at IS NOT NULL AND i.installment_collected_at::date = i.installment_due_at::date THEN i.installment_amount ELSE 0 END) AS in_en_termino,
        SUM(CASE WHEN i.installment_collected_at IS NOT NULL AND i.installment_collected_at::date > i.installment_due_at::date THEN i.installment_amount ELSE 0 END) AS in_atrasado,
        SUM(CASE WHEN i.installment_collected_at IS NULL AND i.installment_discarded_at IS NULL AND i.installment_due_at >= CURRENT_DATE THEN i.installment_amount ELSE 0 END) AS in_pendiente,
        SUM(CASE WHEN i.installment_collected_at IS NULL AND i.installment_discarded_at IS NULL AND i.installment_due_at < CURRENT_DATE THEN i.installment_amount ELSE 0 END) AS in_vencida
      FROM gocuotas_installments i
      JOIN gocuotas_orders o ON o.order_id::text = i.order_id::text
      WHERE o.order_delivered_at IS NOT NULL
        AND o.order_discarded_at IS NULL
        AND o.client_id::text IN ('1', '2026134', '2461631', '5495277')
      GROUP BY 1
    `)
    return res.rows
      .filter((r) => r.cash_date != null)
      .map((r) => ({
        cash_date: r.cash_date instanceof Date ? r.cash_date.toISOString().slice(0, 10) : String(r.cash_date).slice(0, 10),
        in_adelantado: Number(r.in_adelantado),
        in_en_termino: Number(r.in_en_termino),
        in_atrasado: Number(r.in_atrasado),
        in_pendiente: Number(r.in_pendiente),
        in_vencida: Number(r.in_vencida),
      }))
  } finally {
    await client.end()
  }
}

async function fetchVta3eroFromGocelular(): Promise<
  { cash_date: string; out_vta3ero: number }[]
> {
  // La tabla gocuotas_orders en esta réplica no tiene due_expense_at ni expense_amount_in_cents
  // Vta3ero se puede cargar manualmente como egreso hasta que se agreguen esas columnas
  return []
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
  revalidatePath('/inventario/celulares')
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
  revalidatePath('/inventario/celulares')
  return { ok: true }
}

/** Advance N business days from a date */
function addBusinessDays(from: Date, days: number): Date {
  const d = new Date(from)
  let added = 0
  while (added < days) {
    d.setDate(d.getDate() + 1)
    const dow = d.getDay()
    if (dow !== 0 && dow !== 6) added++
  }
  return d
}

function generateProjection(baseDiario: number, endDateStr: string): { cash_date: string; in_proyectado: number }[] {
  if (baseDiario <= 0) return []

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Start from today + 2 business days
  const start = addBusinessDays(today, 2)
  const end = new Date(endDateStr + 'T00:00:00')

  const rows: { cash_date: string; in_proyectado: number }[] = []
  const d = new Date(start)

  while (d <= end) {
    const dow = d.getDay()
    if (dow !== 0 && dow !== 6) {
      // Martes (2) = triple because weekend collections
      const mult = dow === 2 ? 3 : 1
      rows.push({
        cash_date: d.toISOString().slice(0, 10),
        in_proyectado: baseDiario * mult,
      })
    }
    d.setDate(d.getDate() + 1)
  }

  return rows
}

// ---- Main aggregation -----------------------------------------------------

export async function fetchFlujoDeFondos(): Promise<FlujoDiario[]> {
  const [income, vta3ero, asistencias, egresos, baseDiario] = await Promise.all([
    fetchIncomeFromGocelular(),
    fetchVta3eroFromGocelular(),
    fetchAsistenciasFromSupabase(),
    fetchEgresosFromSupabase(),
    getProyeccionDiaria(),
  ])

  const map = new Map<string, FlujoDiario>()

  // Merge income
  for (const r of income) {
    const row = getOrCreate(map, r.cash_date)
    row.in_adelantado += r.in_adelantado
    row.in_en_termino += r.in_en_termino
    row.in_atrasado += r.in_atrasado
    row.in_pendiente += r.in_pendiente
    row.in_vencida += r.in_vencida
  }

  // Merge asistencias
  for (const r of asistencias) {
    const row = getOrCreate(map, r.cash_date)
    row.in_asistencia += r.in_asistencia
  }

  // Merge egresos
  for (const r of egresos) {
    const row = getOrCreate(map, r.cash_date)
    ;(row[r.column] as number) += r.amount
  }

  // Merge vta3ero
  for (const r of vta3ero) {
    const row = getOrCreate(map, r.cash_date)
    row.out_vta3ero += r.out_vta3ero
  }

  // Generate and merge projections (7 months forward from today)
  const today = new Date()
  const projEnd = new Date(today.getFullYear(), today.getMonth() + 7, 0)
  const projections = generateProjection(baseDiario, projEnd.toISOString().slice(0, 10))
  for (const p of projections) {
    const row = getOrCreate(map, p.cash_date)
    row.in_proyectado += p.in_proyectado
  }

  // Sort by cash_date
  const sorted = Array.from(map.values()).sort((a, b) =>
    a.cash_date.localeCompare(b.cash_date)
  )

  // Calculate net_flow and running cash_balance
  let balance = 0
  for (const row of sorted) {
    // NOTE: in_vencida is intentionally excluded from net_flow
    row.net_flow =
      row.in_adelantado +
      row.in_en_termino +
      row.in_atrasado +
      row.in_pendiente +
      row.in_asistencia +
      row.in_proyectado +
      row.out_celulares +
      row.out_licencias +
      row.out_descartables +
      row.out_sueldos +
      row.out_envios +
      row.out_interes +
      row.out_otros +
      row.out_vta3ero
    balance += row.net_flow
    row.cash_balance = balance
  }

  return sorted
}

// ---------------------------------------------------------------------------
// fetchCuotasStats – installment payment status percentages
// ---------------------------------------------------------------------------

export async function fetchCuotasStats(): Promise<{
  total: number
  adelantado: number
  en_termino: number
  atrasado: number
  mora: number
  pct_adelantado: number
  pct_en_termino: number
  pct_atrasado: number
  pct_mora: number
  monto_adelantado: number
  monto_en_termino: number
  monto_atrasado: number
  monto_mora: number
  ppp_recupero: number
}> {
  const empty = { total: 0, adelantado: 0, en_termino: 0, atrasado: 0, mora: 0, pct_adelantado: 0, pct_en_termino: 0, pct_atrasado: 0, pct_mora: 0, monto_adelantado: 0, monto_en_termino: 0, monto_atrasado: 0, monto_mora: 0, ppp_recupero: 0 }
  const url = process.env.GOCELULAR_DB_URL
  if (!url) return empty

  const client = new Client({ connectionString: url })
  await client.connect()
  try {
    const res = await client.query<{
      total: string
      adelantado: string
      en_termino: string
      atrasado: string
      mora: string
      monto_adelantado: string
      monto_en_termino: string
      monto_atrasado: string
      monto_mora: string
      ppp_recupero: string
    }>(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE i.installment_collected_at IS NOT NULL AND i.installment_collected_at::date < i.installment_due_at::date)::int AS adelantado,
        COUNT(*) FILTER (WHERE i.installment_collected_at IS NOT NULL AND i.installment_collected_at::date = i.installment_due_at::date)::int AS en_termino,
        COUNT(*) FILTER (WHERE i.installment_collected_at IS NOT NULL AND i.installment_collected_at::date > i.installment_due_at::date)::int AS atrasado,
        COUNT(*) FILTER (WHERE i.installment_collected_at IS NULL AND i.installment_discarded_at IS NULL)::int AS mora,
        COALESCE(SUM(i.installment_amount) FILTER (WHERE i.installment_collected_at IS NOT NULL AND i.installment_collected_at::date < i.installment_due_at::date), 0) AS monto_adelantado,
        COALESCE(SUM(i.installment_amount) FILTER (WHERE i.installment_collected_at IS NOT NULL AND i.installment_collected_at::date = i.installment_due_at::date), 0) AS monto_en_termino,
        COALESCE(SUM(i.installment_amount) FILTER (WHERE i.installment_collected_at IS NOT NULL AND i.installment_collected_at::date > i.installment_due_at::date), 0) AS monto_atrasado,
        COALESCE(SUM(i.installment_amount) FILTER (WHERE i.installment_collected_at IS NULL AND i.installment_discarded_at IS NULL), 0) AS monto_mora,
        COALESCE(
          SUM(
            (i.installment_collected_at::date - i.installment_due_at::date) * i.installment_amount
          ) FILTER (WHERE i.installment_collected_at IS NOT NULL AND i.installment_collected_at::date > i.installment_due_at::date)
          /
          NULLIF(SUM(i.installment_amount) FILTER (WHERE i.installment_collected_at IS NOT NULL AND i.installment_collected_at::date > i.installment_due_at::date), 0),
          0
        ) AS ppp_recupero
      FROM gocuotas_installments i
      JOIN gocuotas_orders o ON o.order_id::text = i.order_id::text
      WHERE o.order_delivered_at IS NOT NULL
        AND o.order_discarded_at IS NULL
        AND o.client_id::text IN ('1', '2026134', '2461631', '5495277')
        AND i.installment_due_at::date < CURRENT_DATE
    `)

    const row = res.rows[0]
    const total = Number(row.total) || 0
    const adelantado = Number(row.adelantado)
    const en_termino = Number(row.en_termino)
    const atrasado = Number(row.atrasado)
    const mora = Number(row.mora)

    const pct = (n: number) => (total > 0 ? Math.round((n / total) * 10000) / 100 : 0)

    return {
      total, adelantado, en_termino, atrasado, mora,
      pct_adelantado: pct(adelantado),
      pct_en_termino: pct(en_termino),
      pct_atrasado: pct(atrasado),
      pct_mora: pct(mora),
      monto_adelantado: Number(row.monto_adelantado),
      monto_en_termino: Number(row.monto_en_termino),
      monto_atrasado: Number(row.monto_atrasado),
      monto_mora: Number(row.monto_mora),
      ppp_recupero: Math.round(Number(row.ppp_recupero)),
    }
  } finally {
    await client.end()
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
  total_vencido: number
}

export async function fetchDPDIndicadores(): Promise<{
  byOrigination: DPDRow[]
  byDueMonth: DPDRow[]
}> {
  const empty = { byOrigination: [], byDueMonth: [] }
  const url = process.env.GOCELULAR_DB_URL
  if (!url) return empty

  const baseQuery = (mesExpr: string) => `
    SELECT
      ${mesExpr} AS mes,
      SUM(CASE WHEN i.installment_due_at::date < CURRENT_DATE THEN i.installment_amount ELSE 0 END) AS total_vencido,
      SUM(CASE WHEN i.installment_collected_at IS NULL AND i.installment_discarded_at IS NULL
        AND i.installment_due_at::date < CURRENT_DATE
        AND (CURRENT_DATE - i.installment_due_at::date) BETWEEN 1 AND 7
        THEN i.installment_amount ELSE 0 END) AS dpd_1_7,
      SUM(CASE WHEN i.installment_collected_at IS NULL AND i.installment_discarded_at IS NULL
        AND i.installment_due_at::date < CURRENT_DATE
        AND (CURRENT_DATE - i.installment_due_at::date) BETWEEN 8 AND 30
        THEN i.installment_amount ELSE 0 END) AS dpd_8_30,
      SUM(CASE WHEN i.installment_collected_at IS NULL AND i.installment_discarded_at IS NULL
        AND i.installment_due_at::date < CURRENT_DATE
        AND (CURRENT_DATE - i.installment_due_at::date) BETWEEN 31 AND 60
        THEN i.installment_amount ELSE 0 END) AS dpd_31_60,
      SUM(CASE WHEN i.installment_collected_at IS NULL AND i.installment_discarded_at IS NULL
        AND i.installment_due_at::date < CURRENT_DATE
        AND (CURRENT_DATE - i.installment_due_at::date) > 60
        THEN i.installment_amount ELSE 0 END) AS dpd_60_plus
    FROM gocuotas_installments i
    JOIN gocuotas_orders o ON o.order_id::text = i.order_id::text
    WHERE o.order_delivered_at IS NOT NULL
      AND o.order_discarded_at IS NULL
      AND o.client_id::text IN ('1', '2026134', '2461631', '5495277')
    GROUP BY 1
    ORDER BY 1
  `

  const client = new Client({ connectionString: url })
  await client.connect()
  try {
    type QRow = {
      mes: Date | string
      total_vencido: string
      dpd_1_7: string
      dpd_8_30: string
      dpd_31_60: string
      dpd_60_plus: string
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
            total_vencido: total,
          }
        })
    }

    return {
      byOrigination: parseRows(resOrig.rows),
      byDueMonth: parseRows(resDue.rows),
    }
  } finally {
    await client.end()
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

export async function fetchPDIndicadores(): Promise<{
  byOrigination: PDRow[]
  byDueMonth: PDRow[]
  resumen: PDResumen[]
  maxCuota: number
}> {
  const empty = { byOrigination: [], byDueMonth: [], resumen: [], maxCuota: 0 }
  const url = process.env.GOCELULAR_DB_URL
  if (!url) return empty

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
    WHERE o.order_delivered_at IS NOT NULL
      AND o.order_discarded_at IS NULL
      AND o.client_id::text IN ('1', '2026134', '2461631', '5495277')
    GROUP BY 1, 2
    ORDER BY 1, 2
  `

  const client = new Client({ connectionString: url })
  await client.connect()
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
        WHERE o.order_delivered_at IS NOT NULL
          AND o.order_discarded_at IS NULL
          AND o.client_id::text IN ('1', '2026134', '2461631', '5495277')
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
    await client.end()
  }
}

// ---------------------------------------------------------------------------
// fetchVintageAnalysis – Vintage analysis by origination month
// ---------------------------------------------------------------------------

interface VintageRow {
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

export async function fetchVintageAnalysis(): Promise<VintageRow[]> {
  const url = process.env.GOCELULAR_DB_URL
  if (!url) return []

  const client = new Client({ connectionString: url })
  await client.connect()
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
          END AS days_late_paid
        FROM gocuotas_installments i
        JOIN gocuotas_orders o ON o.order_id::text = i.order_id::text
        WHERE o.order_delivered_at IS NOT NULL
          AND o.order_discarded_at IS NULL
          AND o.client_id::text IN ('1', '2026134', '2461631', '5495277')
      ),
      classified AS (
        SELECT
          origination_month,
          amount,
          CASE
            WHEN collected_date IS NOT NULL AND collected_date <= due_date THEN 'COBRADA_EN_TERMINO'
            WHEN collected_date IS NOT NULL AND days_late_paid BETWEEN 1 AND 29 THEN 'RECUPERO_1_29'
            WHEN collected_date IS NOT NULL AND days_late_paid BETWEEN 30 AND 59 THEN 'RECUPERO_30_59'
            WHEN collected_date IS NOT NULL AND days_late_paid BETWEEN 60 AND 89 THEN 'RECUPERO_60_89'
            WHEN collected_date IS NOT NULL AND days_late_paid BETWEEN 90 AND 119 THEN 'RECUPERO_90_119'
            WHEN collected_date IS NOT NULL AND days_late_paid >= 120 THEN 'RECUPERO_120_PLUS'
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
    await client.end()
  }
}
