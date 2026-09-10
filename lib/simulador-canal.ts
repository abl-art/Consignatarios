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

function mesesDesde(origination: string, hoy: Date): number {
  const [y, m] = origination.split('-').map(Number)
  return (hoy.getUTCFullYear() - y) * 12 + (hoy.getUTCMonth() + 1 - m)
}

export function derivarIncobrabilidad(rows: CohorteVintage[], hoy: Date): number | null {
  const maduras = rows.filter(r => mesesDesde(r.origination_month, hoy) >= 6)
  const total = maduras.reduce((s, r) => s + r.amt_total, 0)
  if (total <= 0) return null
  const incobrable = maduras.reduce((s, r) => s + r.amt_incobrable_120_plus, 0)
  return (incobrable / total) * 100
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
