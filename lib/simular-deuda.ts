import type { DeudaPrestamo, DeudaConfig, DeudaAlerta } from '@/lib/types'

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
  out_dev_capital: number
  net_flow: number
  cash_balance: number
  estres?: boolean
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function recalcNetFlow(row: FlujoDiario): number {
  return (
    row.in_adelantado + row.in_en_termino + row.in_atrasado + row.in_pendiente +
    row.in_asistencia + row.in_proyectado +
    row.out_celulares + row.out_licencias + row.out_descartables +
    row.out_sueldos + row.out_envios + row.out_interes +
    row.out_otros + row.out_vta3ero + row.out_dev_capital
  )
}

export function simularDeuda(
  flujoBase: FlujoDiario[],
  prestamos: DeudaPrestamo[],
  config: DeudaConfig,
): { flujo: FlujoDiario[]; alertas: DeudaAlerta[]; diasEstres: string[] } {
  if (flujoBase.length === 0) return { flujo: flujoBase, alertas: [], diasEstres: [] }

  const flujo = flujoBase.map(r => ({ ...r }))
  const map = new Map<string, FlujoDiario>()
  for (const row of flujo) map.set(row.cash_date, row)

  const getRow = (date: string): FlujoDiario | undefined => map.get(date)
  const alertas: DeudaAlerta[] = []

  // Inyectar egresos de préstamos activos en el flujo
  for (const p of prestamos.filter(p => p.estado === 'activo')) {
    if (p.tipo === 'bullet') {
      // Interés mensual: cada 30 días desde la toma
      const tasaDiaria = p.tasa_anual / 365
      const interesMensual = p.saldo_capital * tasaDiaria * 30
      let fechaInteres = addDays(p.fecha_toma, 30)
      while (fechaInteres <= flujo[flujo.length - 1].cash_date) {
        const row = getRow(fechaInteres)
        if (row) row.out_interes += -interesMensual
        fechaInteres = addDays(fechaInteres, 30)
      }
      // Devolución de capital al vencimiento
      if (p.fecha_vencimiento) {
        const row = getRow(p.fecha_vencimiento)
        if (row) row.out_dev_capital += -p.saldo_capital
      }
    }
    if (p.tipo === 'descubierto') {
      const tasaDiaria = p.tasa_anual / 365
      for (const row of flujo) {
        if (row.cash_date >= p.fecha_toma) {
          row.out_interes += -(p.saldo_capital * tasaDiaria)
        }
      }
    }
  }

  // Recalcular net_flow y balance con deuda inyectada
  let balance = 0
  for (const row of flujo) {
    row.net_flow = recalcNetFlow(row)
    balance += row.net_flow
    row.cash_balance = balance
  }

  // Detectar días de estrés (saldo bajo mínimo)
  const diasEstres: string[] = []
  for (const row of flujo) {
    if (row.cash_balance < config.saldo_minimo) {
      row.estres = true
      diasEstres.push(row.cash_date)
    }
  }

  // Alerta de límite de línea
  const deudaVigente = prestamos
    .filter(p => p.estado === 'activo')
    .reduce((sum, p) => sum + p.saldo_capital, 0)
  const usoPct = config.limite > 0 ? (deudaVigente / config.limite) * 100 : 0
  if (usoPct >= 80) {
    alertas.push({ tipo: 'limite', monto: deudaVigente, uso_porcentaje: Math.round(usoPct) })
  }

  if (diasEstres.length > 0) {
    alertas.push({ tipo: 'estres', dias_estres: diasEstres.length })
  }

  return { flujo, alertas, diasEstres }
}
