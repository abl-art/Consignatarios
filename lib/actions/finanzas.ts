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
  in_asistencia: number
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
    in_asistencia: 0,
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
  { cash_date: string; in_adelantado: number; in_en_termino: number; in_atrasado: number; in_pendiente: number }[]
> {
  const url = process.env.GOCELULAR_DB_URL
  if (!url) return []

  const client = new Client({ connectionString: url })
  await client.connect()
  try {
    const res = await client.query<{
      cash_date: string
      in_adelantado: string
      in_en_termino: string
      in_atrasado: string
      in_pendiente: string
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
        SUM(CASE WHEN i.installment_collected_at IS NULL AND i.installment_discarded_at IS NULL THEN i.installment_amount ELSE 0 END) AS in_pendiente
      FROM gocuotas_installments i
      JOIN gocuotas_orders o ON o.order_id::text = i.order_id::text
      WHERE o.order_delivered_at IS NOT NULL
        AND o.order_discarded_at IS NULL
        AND o.client_id::text IN ('2026134', '2461631', '5495277')
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

// ---- Main aggregation -----------------------------------------------------

export async function fetchFlujoDeFondos(): Promise<FlujoDiario[]> {
  const [income, vta3ero, asistencias, egresos] = await Promise.all([
    fetchIncomeFromGocelular(),
    fetchVta3eroFromGocelular(),
    fetchAsistenciasFromSupabase(),
    fetchEgresosFromSupabase(),
  ])

  const map = new Map<string, FlujoDiario>()

  // Merge income
  for (const r of income) {
    const row = getOrCreate(map, r.cash_date)
    row.in_adelantado += r.in_adelantado
    row.in_en_termino += r.in_en_termino
    row.in_atrasado += r.in_atrasado
    row.in_pendiente += r.in_pendiente
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

  // Sort by cash_date
  const sorted = Array.from(map.values()).sort((a, b) =>
    a.cash_date.localeCompare(b.cash_date)
  )

  // Calculate net_flow and running cash_balance
  let balance = 0
  for (const row of sorted) {
    row.net_flow =
      row.in_adelantado +
      row.in_en_termino +
      row.in_atrasado +
      row.in_pendiente +
      row.in_asistencia +
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
