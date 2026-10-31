import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { TOKEN_DENUNCIA, normalizarDni } from '@/lib/seguros'
import { esCertificadoVigente, normalizarNumeroCertificado } from '@/lib/denuncia-robo'
import { fetchMoraPorOrdenes } from '@/lib/gocelular'

export const dynamic = 'force-dynamic'

export interface RespuestaValidar {
  ok: boolean
  /** 'mora' = certificado vigente pero con cuotas vencidas: el formulario corta con el mensaje de ponerse al día. */
  motivo?: 'mora'
  certificado?: { id: string; numero: number; articulo: string; fechaCompra: string }
}

/**
 * Identificación del reclamo (regla de Emiliano 30/10/2026): DNI + N° de
 * certificado, AMBOS obligatorios — el número está en el mail de bienvenida
 * ("Tu seguro contra robo"), así que solo el titular lo tiene; de paso nadie
 * puede consultar la mora de un tercero solo con el DNI. Con match vigente se
 * chequea la mora en vivo (réplica GOcuotas): cualquier cuota vencida corta
 * el flujo — primero se pone al día, después denuncia. Si la consulta de
 * mora falla, se deja pasar (fail-open): el gate real es Yami en backoffice,
 * que ve la mora en vivo en la pestaña Siniestros; rebotar denuncias por una
 * caída nuestra sería peor.
 *
 * Respuesta deliberadamente chata: sin match → { ok: false } genérico (no
 * distingue "certificado inexistente" de "DNI de otro titular" ni de "ya no
 * vigente"); con match → solo número/artículo/fecha de compra.
 */
export async function POST(request: NextRequest) {
  let body: { token?: unknown; dni?: unknown; certificado?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json<RespuestaValidar>({ ok: false }, { status: 400 })
  }

  if (body.token !== TOKEN_DENUNCIA) {
    return NextResponse.json<RespuestaValidar>({ ok: false }, { status: 401 })
  }

  const dniNormalizado = normalizarDni(typeof body.dni === 'string' ? body.dni : '')
  const numeroCert = normalizarNumeroCertificado(typeof body.certificado === 'string' ? body.certificado : '')
  if (!dniNormalizado || numeroCert === null) {
    return NextResponse.json<RespuestaValidar>({ ok: false })
  }

  const supabase = createAdminClient()
  const hoy = new Date().toISOString().slice(0, 10)
  // Vigencia filtrada dos veces a propósito: en la query (performance) y en
  // JS con esCertificadoVigente — la misma función pura del POST de creación,
  // para que la definición de "vigente" nunca diverja entre endpoints.
  const { data, error } = await supabase
    .from('seguros_certificados')
    .select('id, numero, dni, articulo, inicio_vig, estado, fecha_anula, fecha_siniestro, fin_vig, gocuotas_order_id')
    .eq('estado', 'emitido')
    .eq('numero', numeroCert)
    .eq('dni', dniNormalizado)
    .is('fecha_anula', null)
    .is('fecha_siniestro', null)
    .gte('fin_vig', hoy)
    .maybeSingle()

  if (error) {
    console.error('[denuncia-robo/validar] error leyendo certificado:', error.message)
    return NextResponse.json<RespuestaValidar>({ ok: false }, { status: 500 })
  }

  const vigente =
    !!data &&
    esCertificadoVigente(
      { estado: data.estado, fechaAnula: data.fecha_anula, fechaSiniestro: data.fecha_siniestro, finVig: data.fin_vig },
      hoy
    ) &&
    data.dni !== null &&
    normalizarDni(data.dni) === dniNormalizado

  if (!data || !vigente) {
    return NextResponse.json<RespuestaValidar>({ ok: false })
  }

  // Mora en vivo (fail-open si la réplica no responde).
  try {
    const moras = await fetchMoraPorOrdenes([data.gocuotas_order_id as string])
    const mora = moras.get(data.gocuotas_order_id as string)
    if (mora && mora.diasMora > 0) {
      return NextResponse.json<RespuestaValidar>({ ok: false, motivo: 'mora' })
    }
  } catch (e) {
    console.error('[denuncia-robo/validar] mora sin dato (fail-open):', e instanceof Error ? e.message : e)
  }

  return NextResponse.json<RespuestaValidar>({
    ok: true,
    certificado: {
      id: data.id as string,
      numero: data.numero as number,
      articulo: data.articulo as string,
      fechaCompra: data.inicio_vig as string,
    },
  })
}
