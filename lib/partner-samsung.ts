// Lógica pura del link para Samsung (/partner/samsung): escenarios de share
// sobre la proyección de venta PROPIA y plan por modelo.
//
// Acuerdo con Samsung desde el 1/10/2026 (definición de Emiliano, 1/10):
// - Escenario "hasta 30/9": share HISTÓRICO FIJO de Samsung en venta propia
//   (ventana jul-sep 2026) — la foto pre-acuerdo, no cambia más.
// - Escenario "desde 1/10": share REAL medido desde el 1/10 hasta hoy,
//   recalculado en cada visita — el último share mantiene viva la proyección.
// - Ambos shares se miden SOLO sobre órdenes con equipo asignado (con marca):
//   el device llega al picking con ~1 día de lag y las órdenes sin marca en el
//   denominador aplastan el share de la ventana fresca (2/10: 9,3% vs 34,9%).

export interface MesProyeccion {
  mes: string // YYYY-MM
  hibrido: number // unidades propia proyectadas
  gocuotas: number
}

export interface EscenarioMes {
  mes: string
  // unidades Samsung = proyección propia × share, por método
  fijoHibrido: number
  fijoGocuotas: number
  actualHibrido: number
  actualGocuotas: number
}

export function armarEscenarios(meses: MesProyeccion[], shareFijo: number, shareActual: number): EscenarioMes[] {
  return meses.map(m => ({
    mes: m.mes,
    fijoHibrido: Math.round(m.hibrido * shareFijo),
    fijoGocuotas: Math.round(m.gocuotas * shareFijo),
    actualHibrido: Math.round(m.hibrido * shareActual),
    actualGocuotas: Math.round(m.gocuotas * shareActual),
  }))
}

export function calcularShare(unidadesMarca: number, unidadesTotal: number): number {
  if (unidadesTotal <= 0) return 0
  return unidadesMarca / unidadesTotal
}

// Los nombres de modelo en devices.model vienen en variantes libres
// ("Galaxy A16", "Samsung Galaxy A16 4/128GB", "Celular Samsung Galaxy A17 4/128 GB").
// Agrupamos por modelo comercial: familia + 5G si corresponde.
export function modeloComercialSamsung(model: string | null): string {
  if (!model) return 'Otro'
  const limpio = model.replace(/\s+/g, ' ').trim()
  const fam = limpio.match(/\b([AMSZ]\d{2,3})\b/i)
  const es5g = /5\s*g/i.test(limpio)
  if (fam) return `Galaxy ${fam[1].toUpperCase()}${es5g ? ' 5G' : ''}`
  const sSerie = limpio.match(/\bS(\d{2})\b/i)
  if (sSerie) return `Galaxy S${sSerie[1]}${es5g ? ' 5G' : ''}`
  return limpio.replace(/^celular\s+/i, '').replace(/^samsung\s+/i, '')
}

export interface ModeloRanking {
  modelo: string
  unidades90d: number
  mix: number // participación dentro de Samsung (0-1)
  // plan mensual con el share actual (promedio de los meses proyectados), por método
  planMensualHibrido: number
  planMensualGocuotas: number
}

export function armarRankingConPlan(
  unidadesPorModelo: { modelo: string; unidades: number }[],
  escenarios: EscenarioMes[]
): ModeloRanking[] {
  const total = unidadesPorModelo.reduce((a, b) => a + b.unidades, 0)
  const meses = escenarios.length || 1
  const promActualHibrido = escenarios.reduce((a, e) => a + e.actualHibrido, 0) / meses
  const promActualGocuotas = escenarios.reduce((a, e) => a + e.actualGocuotas, 0) / meses
  return unidadesPorModelo
    .map(m => {
      const mix = total > 0 ? m.unidades / total : 0
      return {
        modelo: m.modelo,
        unidades90d: m.unidades,
        mix,
        planMensualHibrido: Math.round(promActualHibrido * mix),
        planMensualGocuotas: Math.round(promActualGocuotas * mix),
      }
    })
    .sort((a, b) => b.unidades90d - a.unidades90d)
}
