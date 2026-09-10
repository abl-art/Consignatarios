export interface CohorteVintage {
  origination_month: string // 'YYYY-MM'
  amt_total: number
  amt_incobrable_120_plus: number
  amt_cobrada_en_termino: number
  amt_recupero_1_29: number
  amt_recupero_30_59: number
  amt_recupero_60_89: number
  amt_recupero_90_119: number
  amt_recupero_120_plus: number
}

export interface DatosCanal {
  incobrabilidad_pct: number | null // % (5 = 5%)
  fpd_pct: number | null
  mora_dias: number | null
  ticket_promedio: number | null
}

export interface IncobrabilidadCanalInput {
  resueltas: number // cuotas de órdenes sanas vencidas hace 120+ días (tuvieron chance de resolverse)
  mora120: number // de esas, impagas con 120+ días de mora
  cbTotal: number // total de cuotas de órdenes con contracargo (el CB revierte hasta lo cobrado)
  transTotal: number // total de cuotas de órdenes con equipo en transición 30+
  transNoCobrado: number // de esas, las no cobradas (lo cobrado fue ingreso real de caja)
}

// Pérdida sobre lo RESUELTO, no sobre lo originado: el denominador solo incluye
// cuotas que ya tuvieron la chance de volverse incobrables, más las órdenes
// castigadas enteras (contracargo/transición) que se consideran resueltas-malas.
// Regla de Emiliano (10 sep 2026): CB castiga la orden completa; transición solo
// lo no cobrado.
export function incobrabilidadResuelta(d: IncobrabilidadCanalInput): number | null {
  const den = d.resueltas + d.cbTotal + d.transTotal
  if (den <= 0) return null
  const num = d.mora120 + d.cbTotal + d.transNoCobrado
  return (num / den) * 100
}

const BUCKETS_MORA: [keyof CohorteVintage, number][] = [
  ['amt_cobrada_en_termino', 0], ['amt_recupero_1_29', 15], ['amt_recupero_30_59', 45],
  ['amt_recupero_60_89', 75], ['amt_recupero_90_119', 105], ['amt_recupero_120_plus', 135],
]

export function derivarMoraDias(rows: CohorteVintage[]): number | null {
  let monto = 0, ponderado = 0
  for (const r of rows) {
    for (const [campo, dias] of BUCKETS_MORA) {
      const v = r[campo] as number
      monto += v
      ponderado += v * dias
    }
  }
  if (monto <= 0) return null
  return ponderado / monto
}
