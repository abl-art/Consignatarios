import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { TOKEN_DENUNCIA, normalizarDni } from '@/lib/seguros'

export const dynamic = 'force-dynamic'

export interface RespuestaValidar {
  ok: boolean
  certificados?: { id: string; articulo: string; fechaCompra: string }[]
}

/**
 * Matchea el DNI ingresado contra certificados vigentes (estado='emitido' AND
 * fecha_anula IS NULL AND fecha_siniestro IS NULL AND fin_vig >= hoy).
 * Respuesta deliberadamente chata para no filtrar nada de la venta real:
 * sin match → { ok: false } genérico (no distingue "DNI no existe" de
 * "existe pero sin seguro vigente" ni de cualquier otro motivo); con match →
 * solo id/artículo/fecha de compra, nunca nombre, DNI, IMEI o suma asegurada.
 */
export async function POST(request: NextRequest) {
  let body: { token?: unknown; dni?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json<RespuestaValidar>({ ok: false }, { status: 400 })
  }

  if (body.token !== TOKEN_DENUNCIA) {
    return NextResponse.json<RespuestaValidar>({ ok: false }, { status: 401 })
  }

  const dniInput = typeof body.dni === 'string' ? body.dni : ''
  const dniNormalizado = normalizarDni(dniInput)
  if (!dniNormalizado) {
    return NextResponse.json<RespuestaValidar>({ ok: false })
  }

  const supabase = createAdminClient()
  const hoy = new Date().toISOString().slice(0, 10)
  const { data, error } = await supabase
    .from('seguros_certificados')
    .select('id, dni, articulo, inicio_vig')
    .eq('estado', 'emitido')
    .is('fecha_anula', null)
    .is('fecha_siniestro', null)
    .gte('fin_vig', hoy)

  if (error) {
    console.error('[denuncia-robo/validar] error leyendo certificados:', error.message)
    return NextResponse.json<RespuestaValidar>({ ok: false }, { status: 500 })
  }

  const matches = (data ?? []).filter(
    (c) => c.dni !== null && normalizarDni(c.dni) === dniNormalizado
  )

  if (matches.length === 0) {
    return NextResponse.json<RespuestaValidar>({ ok: false })
  }

  return NextResponse.json<RespuestaValidar>({
    ok: true,
    certificados: matches.map((c) => ({ id: c.id, articulo: c.articulo, fechaCompra: c.inicio_vig })),
  })
}
