// Novedades SALIENTES hacia GOcelular: el espejo del webhook entrante de
// Pedro (lib/novedades.ts). Mismo contrato: {titulo*, detalle?, tipo?
// (schema/feature/aviso), referencia?}, misma firma HMAC compartida.

export interface NovedadSalienteInput {
  titulo: string
  detalle?: string
  tipo?: string
  referencia?: string
}

export const TIPOS_NOVEDAD = ['schema', 'feature', 'aviso'] as const

export function validarNovedadSaliente(input: NovedadSalienteInput): string[] {
  const errores: string[] = []
  if (!input.titulo || input.titulo.trim() === '') errores.push('El título es obligatorio')
  if (input.tipo && input.tipo.trim() !== '' && !TIPOS_NOVEDAD.includes(input.tipo as (typeof TIPOS_NOVEDAD)[number])) {
    errores.push('Tipo inválido: schema, feature o aviso')
  }
  return errores
}

/** Payload con los topes del contrato (espejo de parseNovedades); campos vacíos afuera. */
export function armarNovedadSaliente(input: NovedadSalienteInput): Record<string, string> {
  const out: Record<string, string> = { titulo: input.titulo.trim().slice(0, 300) }
  const detalle = input.detalle?.trim()
  if (detalle) out.detalle = detalle.slice(0, 2000)
  const tipo = input.tipo?.trim()
  if (tipo) out.tipo = tipo.slice(0, 50)
  const referencia = input.referencia?.trim()
  if (referencia) out.referencia = referencia.slice(0, 200)
  return out
}
