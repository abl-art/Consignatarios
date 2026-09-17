// ─── Flujo de fondos por canal (lógica pura) ──────────────────────────────
// Arma las tres variantes del flujo diario a partir de las mismas fuentes:
//   - total:    todo, igual que el flujo histórico
//   - propia:   cuotas de clientes propios + asistencias, mayoristas,
//               proyección y todos los egresos salvo V3 (regla de Emiliano:
//               lo que no tiene canal se afecta al flujo propio)
//   - terceros: solo las cuotas de terceros que ingresan + el egreso V3
import { aDiaHabilSiguiente } from '@/lib/dias-habiles'

export interface FlujoDiario {
  cash_date: string
  in_adelantado: number
  in_en_termino: number
  in_atrasado: number
  in_pendiente: number
  in_vencida: number
  in_asistencia: number
  in_mayoristas: number
  in_proyectado: number
  out_celulares: number
  out_licencias: number
  out_descartables: number
  out_sueldos: number
  out_envios: number
  out_interes: number
  out_otros: number
  out_vta3ero: number
  out_dev_capital: number
  net_flow: number
  cash_balance: number
  estres?: boolean
}

export interface IncomeRow {
  cash_date: string
  in_adelantado: number
  in_en_termino: number
  in_atrasado: number
  in_pendiente: number
  in_vencida: number
}

export interface FuentesFlujo {
  incomePropia: IncomeRow[]
  incomeTerceros: IncomeRow[]
  vta3ero: { cash_date: string; out_vta3ero: number }[]
  asistencias: { cash_date: string; in_asistencia: number }[]
  egresos: { cash_date: string; column: keyof FlujoDiario; amount: number }[]
  pagosMayoristas: { cash_date: string; in_mayoristas: number }[]
  proyeccionDiaria: number
  hoy?: Date
}

export interface FlujoPorCanal {
  total: FlujoDiario[]
  propia: FlujoDiario[]
  terceros: FlujoDiario[]
}

// Tarjetas de cuotas vencidas del tab Flujo (fetchCuotasStats)
export interface CuotasStats {
  total: number
  adelantado: number
  en_termino: number
  atrasado: number
  mora: number
  contracargos: number
  pct_adelantado: number
  pct_en_termino: number
  pct_atrasado: number
  pct_mora: number
  pct_contracargos: number
  monto_adelantado: number
  monto_en_termino: number
  monto_atrasado: number
  monto_mora: number
  monto_contracargos: number
  ppp_recupero: number
  ppp_mora: number
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
    in_mayoristas: 0,
    in_proyectado: 0,
    out_celulares: 0,
    out_licencias: 0,
    out_descartables: 0,
    out_sueldos: 0,
    out_envios: 0,
    out_interes: 0,
    out_otros: 0,
    out_vta3ero: 0,
    out_dev_capital: 0,
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

export function generateProjection(
  baseDiario: number,
  endDateStr: string,
  hoy: Date = new Date(),
): { cash_date: string; in_proyectado: number }[] {
  if (baseDiario <= 0) return []

  const today = new Date(hoy)
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

function armarFlujo(f: {
  income: IncomeRow[]
  vta3ero: { cash_date: string; out_vta3ero: number }[]
  asistencias: { cash_date: string; in_asistencia: number }[]
  egresos: { cash_date: string; column: keyof FlujoDiario; amount: number }[]
  pagosMayoristas: { cash_date: string; in_mayoristas: number }[]
  proyecciones: { cash_date: string; in_proyectado: number }[]
}): FlujoDiario[] {
  const map = new Map<string, FlujoDiario>()

  for (const r of f.income) {
    const row = getOrCreate(map, r.cash_date)
    row.in_adelantado += r.in_adelantado
    row.in_en_termino += r.in_en_termino
    row.in_atrasado += r.in_atrasado
    row.in_pendiente += r.in_pendiente
    row.in_vencida += r.in_vencida
  }

  for (const r of f.asistencias) {
    const row = getOrCreate(map, r.cash_date)
    row.in_asistencia += r.in_asistencia
  }

  // Egresos — no pagamos en fin de semana: sábado/domingo → lunes
  for (const r of f.egresos) {
    const row = getOrCreate(map, aDiaHabilSiguiente(r.cash_date))
    ;(row[r.column] as number) += r.amount
  }

  // Vta3ero (también es un pago nuestro: se corre a día hábil)
  for (const r of f.vta3ero) {
    const row = getOrCreate(map, aDiaHabilSiguiente(r.cash_date))
    row.out_vta3ero += r.out_vta3ero
  }

  for (const r of f.pagosMayoristas) {
    const row = getOrCreate(map, r.cash_date)
    row.in_mayoristas += r.in_mayoristas
  }

  for (const p of f.proyecciones) {
    const row = getOrCreate(map, p.cash_date)
    row.in_proyectado += p.in_proyectado
  }

  // Calendario completo: los días sin movimiento quedan en cero pero se
  // muestran igual — el flujo se lee corrido, sin saltos de fechas
  const fechas = [...map.keys()].sort()
  if (fechas.length > 0) {
    const d = new Date(fechas[0] + 'T00:00:00Z')
    const fin = new Date(fechas[fechas.length - 1] + 'T00:00:00Z')
    while (d <= fin) {
      getOrCreate(map, d.toISOString().slice(0, 10))
      d.setUTCDate(d.getUTCDate() + 1)
    }
  }

  const sorted = Array.from(map.values()).sort((a, b) =>
    a.cash_date.localeCompare(b.cash_date)
  )

  // NOTE: in_vencida is intentionally excluded from net_flow
  let balance = 0
  for (const row of sorted) {
    row.net_flow =
      row.in_adelantado +
      row.in_en_termino +
      row.in_atrasado +
      row.in_pendiente +
      row.in_asistencia +
      row.in_mayoristas +
      row.in_proyectado +
      row.out_celulares +
      row.out_licencias +
      row.out_descartables +
      row.out_sueldos +
      row.out_envios +
      row.out_interes +
      row.out_otros +
      row.out_vta3ero +
      row.out_dev_capital
    balance += row.net_flow
    row.cash_balance = balance
  }

  return sorted
}

export function armarFlujoPorCanal(f: FuentesFlujo): FlujoPorCanal {
  const hoy = f.hoy ?? new Date()
  // Proyección de ventas nuevas: 7 meses hacia adelante, canal propio
  const projEnd = new Date(hoy.getFullYear(), hoy.getMonth() + 7, 0)
  const proyecciones = generateProjection(f.proyeccionDiaria, projEnd.toISOString().slice(0, 10), hoy)

  const total = armarFlujo({
    income: [...f.incomePropia, ...f.incomeTerceros],
    vta3ero: f.vta3ero,
    asistencias: f.asistencias,
    egresos: f.egresos,
    pagosMayoristas: f.pagosMayoristas,
    proyecciones,
  })

  const propia = armarFlujo({
    income: f.incomePropia,
    vta3ero: [],
    asistencias: f.asistencias,
    egresos: f.egresos,
    pagosMayoristas: f.pagosMayoristas,
    proyecciones,
  })

  const terceros = armarFlujo({
    income: f.incomeTerceros,
    vta3ero: f.vta3ero,
    asistencias: [],
    egresos: [],
    pagosMayoristas: [],
    proyecciones: [],
  })

  return { total, propia, terceros }
}
