import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { TOKEN_DENUNCIA, normalizarDni } from '@/lib/seguros'
import { esCertificadoVigente } from '@/lib/denuncia-robo'

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
  // El filtro de vigencia se aplica dos veces a propósito: en la query (por
  // performance/índices) y de nuevo en JS con `esCertificadoVigente` — la
  // misma función pura que usa el POST de creación, para que la definición
  // de "vigente" nunca pueda divergir entre los dos endpoints.
  // El DNI también se filtra en la query (prepararCertificados en lib/seguros.ts
  // ya normaliza con normalizarDni antes de persistir, así que el valor
  // guardado coincide con dniNormalizado) y de nuevo en JS más abajo — antes
  // solo filtraba en JS y esta query traía TODOS los certificados vigentes
  // del país en cada intento de denuncia.
  const { data, error } = await supabase
    .from('seguros_certificados')
    .select('id, dni, articulo, inicio_vig, estado, fecha_anula, fecha_siniestro, fin_vig')
    .eq('estado', 'emitido')
    .eq('dni', dniNormalizado)
    .is('fecha_anula', null)
    .is('fecha_siniestro', null)
    .gte('fin_vig', hoy)

  if (error) {
    console.error('[denuncia-robo/validar] error leyendo certificados:', error.message)
    return NextResponse.json<RespuestaValidar>({ ok: false }, { status: 500 })
  }

  const matches = (data ?? []).filter(
    (c) =>
      esCertificadoVigente(
        { estado: c.estado, fechaAnula: c.fecha_anula, fechaSiniestro: c.fecha_siniestro, finVig: c.fin_vig },
        hoy
      ) &&
      c.dni !== null &&
      normalizarDni(c.dni) === dniNormalizado
  )

  if (matches.length === 0) {
    return NextResponse.json<RespuestaValidar>({ ok: false })
  }

  return NextResponse.json<RespuestaValidar>({
    ok: true,
    certificados: matches.map((c) => ({ id: c.id, articulo: c.articulo, fechaCompra: c.inicio_vig })),
  })
}
