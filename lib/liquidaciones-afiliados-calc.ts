// Cálculo puro de liquidaciones de afiliados con ajustes por anulaciones
// post-liquidación (arrepentimientos). La generación (lib/actions/
// liquidaciones-afiliados.ts) orquesta IO; acá vive la aritmética.

export interface ResumenLiquidacion {
  totalComisiones: number
  ajustes: number // siempre <= 0
  saldoAnterior: number // siempre <= 0
  montoAPagar: number
  estado: 'pendiente' | 'compensada'
}

const round2 = (n: number) => Math.round(n * 100) / 100 + 0 // +0 evita -0

export function calcularLiquidacion(args: {
  totalComisiones: number
  comisionesAnuladas: number[]
  saldoAnterior: number
}): ResumenLiquidacion {
  const ajustes = round2(-args.comisionesAnuladas.reduce((s, c) => s + c, 0))
  const montoAPagar = round2(args.totalComisiones + ajustes + args.saldoAnterior)
  return {
    totalComisiones: round2(args.totalComisiones),
    ajustes,
    saldoAnterior: round2(args.saldoAnterior),
    montoAPagar,
    estado: montoAPagar > 0 ? 'pendiente' : 'compensada',
  }
}

// Saldo que una liquidación le deja a la del mes siguiente: solo las
// negativas (compensadas) arrastran deuda; las positivas no dejan nada.
export function saldoArrastre(montoAPagar: number): number {
  return Math.min(0, montoAPagar)
}

export interface OrdenAnulada {
  orderId: string
  orderNumber: string | null
  partnerSlug: string
  producto: string | null
  comision: number
  mes: string // YYYY-MM de created_at (mes en que se liquidó)
  paidAt: string
  cancelledAt: string
}

export interface LiquidacionPrevia {
  partnerSlug: string
  mes: string
  createdAt: string
}

// Las liquidaciones generadas antes de esta fecha usaron la query vieja, que
// incluía toda orden con status 'paid' SIN filtrar cancelled_at (al anularse
// una orden el status queda 'paid'; solo se setea cancelled_at). O sea: esas
// liquidaciones pagaron comisión incluso por órdenes ya anuladas al momento
// de generarse. Desde esta fecha la generación excluye anuladas.
export const CORTE_FILTRO_ANULADAS = '2026-10-07T00:00:00Z'

// Una orden anulada se descuenta solo si su comisión efectivamente entró en
// una liquidación generada. En liquidaciones nuevas (post-corte): estaba paga
// al generarse y se anuló después. En liquidaciones legacy (pre-corte): toda
// orden paga entró, aunque ya estuviera anulada. Las ya descontadas no se
// repiten.
export function detectarAjustes(
  ordenes: OrdenAnulada[],
  liquidaciones: LiquidacionPrevia[],
  yaAplicadas: Set<string>
): OrdenAnulada[] {
  const liqPorClave = new Map(liquidaciones.map(l => [`${l.partnerSlug}|${l.mes}`, l]))
  return ordenes.filter(o => {
    if (yaAplicadas.has(o.orderId)) return false
    const liq = liqPorClave.get(`${o.partnerSlug}|${o.mes}`)
    if (!liq) return false
    const generada = new Date(liq.createdAt)
    if (new Date(o.paidAt) >= generada) return false
    const esLegacy = generada < new Date(CORTE_FILTRO_ANULADAS)
    return esLegacy || new Date(o.cancelledAt) > generada
  })
}
