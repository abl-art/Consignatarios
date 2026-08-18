// Helpers compartidos entre server y client components — no llevar a un módulo
// 'use client': los exports de módulos cliente no son invocables desde el servidor.

// A partir de estos dias en transito el lote deja de ser un envio en curso y pasa a ser
// un dato trabado: las unidades no estan en ningun deposito y no suman al total de stock.
export const DIAS_TRANSITO_TRABADO = 10

export function diasDesde(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
}
