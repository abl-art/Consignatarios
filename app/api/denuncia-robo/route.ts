import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { enviarMail } from '@/lib/mailer'
import { TOKEN_DENUNCIA, normalizarDni } from '@/lib/seguros'
import { validarArchivoDenuncia, sanitizarNombreArchivo, esCertificadoVigente } from '@/lib/denuncia-robo'

export const dynamic = 'force-dynamic'

const MENSAJE_SIN_MATCH = 'No encontramos un seguro vigente para ese DNI. Revisá el número o escribinos.'

// Postgres tira un error de tipo (22P02) si `certificadoId` no tiene forma
// de uuid — eso llegaba como `errorCert` y respondía 500, un oráculo
// distinto del 403 genérico de "no match". Filtrando la forma ANTES de
// consultar, un certificadoId inventado/mal formado cae en el mismo 403 que
// cualquier otro no-match (nunca llega a tocar la DB).
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(request: NextRequest) {
  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ ok: false, error: 'Solicitud inválida' }, { status: 400 })
  }

  if (formData.get('token') !== TOKEN_DENUNCIA) {
    return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 })
  }

  const certificadoId = formData.get('certificadoId')
  const dniInput = formData.get('dni')
  const archivo = formData.get('archivo')

  if (typeof certificadoId !== 'string' || !certificadoId) {
    return NextResponse.json({ ok: false, error: 'Falta certificadoId' }, { status: 400 })
  }
  if (typeof dniInput !== 'string' || !dniInput.trim()) {
    return NextResponse.json({ ok: false, error: 'Falta el DNI' }, { status: 400 })
  }
  if (!(archivo instanceof File)) {
    return NextResponse.json({ ok: false, error: 'Falta el archivo' }, { status: 400 })
  }

  const bytes = new Uint8Array(await archivo.arrayBuffer())
  const resultadoArchivo = validarArchivoDenuncia(archivo.name, archivo.size, archivo.type, bytes)
  if (!resultadoArchivo.ok) {
    return NextResponse.json({ ok: false, error: resultadoArchivo.motivo }, { status: 400 })
  }

  const dniNormalizado = normalizarDni(dniInput)
  if (!dniNormalizado) {
    return NextResponse.json({ ok: false, error: 'DNI inválido' }, { status: 400 })
  }

  if (!UUID_REGEX.test(certificadoId)) {
    return NextResponse.json({ ok: false, error: MENSAJE_SIN_MATCH }, { status: 403 })
  }

  const supabase = createAdminClient()

  // Re-validar TODO server-side: nunca confiar en que el cliente ya validó
  // esto en el paso anterior (/validar). certificadoId y dni pueden haber
  // sido manipulados antes de llegar acá.
  const { data: cert, error: errorCert } = await supabase
    .from('seguros_certificados')
    .select('id, dni, cliente, articulo, imei, estado, fecha_anula, fecha_siniestro, fin_vig')
    .eq('id', certificadoId)
    .maybeSingle()

  if (errorCert) {
    console.error('[denuncia-robo] error leyendo certificado:', errorCert.message)
    return NextResponse.json({ ok: false, error: 'Error al validar el certificado' }, { status: 500 })
  }

  const hoy = new Date().toISOString().slice(0, 10)
  const vigente =
    !!cert &&
    esCertificadoVigente(
      { estado: cert.estado, fechaAnula: cert.fecha_anula, fechaSiniestro: cert.fecha_siniestro, finVig: cert.fin_vig },
      hoy
    )
  const dniCoincide = !!cert && cert.dni !== null && normalizarDni(cert.dni) === dniNormalizado

  if (!cert || !vigente || !dniCoincide) {
    // Mismo mensaje genérico que /validar — no confirma ni niega si el
    // certificadoId existe, si está vigente o si el DNI es de otro titular.
    return NextResponse.json({ ok: false, error: MENSAJE_SIN_MATCH }, { status: 403 })
  }

  const timestamp = Date.now()
  const path = `${cert.id}/${timestamp}-${sanitizarNombreArchivo(archivo.name)}`

  const { error: errorUpload } = await supabase.storage
    .from('denuncias-robo')
    .upload(path, bytes, { contentType: resultadoArchivo.mime })
  if (errorUpload) {
    console.error('[denuncia-robo] error subiendo archivo:', errorUpload.message)
    return NextResponse.json({ ok: false, error: 'No se pudo subir el archivo' }, { status: 500 })
  }

  const { data: siniestro, error: errorInsert } = await supabase
    .from('seguros_siniestros')
    .insert({
      certificado_id: cert.id,
      dni_ingresado: dniNormalizado,
      archivo_path: path,
      estado: 'nuevo',
    })
    .select('id')
    .single()

  if (errorInsert || !siniestro) {
    console.error('[denuncia-robo] error insertando siniestro:', errorInsert?.message)
    return NextResponse.json({ ok: false, error: 'No se pudo registrar la denuncia' }, { status: 500 })
  }

  // El siniestro ya quedó creado en este punto — si el mail falla, se loguea
  // pero NUNCA se revierte ni se devuelve error al cliente (mismo criterio
  // que Backlog: la denuncia es lo que importa, el aviso es secundario).
  const destino = process.env.SEGUROS_MAIL_PARA ?? 'yamila@gocuotas.com'
  const texto = [
    'Nueva denuncia de robo cargada desde el formulario público (/denuncia-robo).',
    '',
    `Cliente: ${cert.cliente ?? '(sin dato)'}`,
    `DNI: ${dniNormalizado}`,
    `Artículo: ${cert.articulo}`,
    `IMEI: ${cert.imei}`,
    `Siniestro ID: ${siniestro.id}`,
  ].join('\n')

  try {
    const resultadoMail = await enviarMail({
      para: destino,
      asunto: `Denuncia de robo — ${cert.articulo}`,
      texto,
    })
    if (!resultadoMail.ok) {
      console.error('[denuncia-robo] enviarMail devolvió error:', resultadoMail.error)
    }
  } catch (e) {
    console.error('[denuncia-robo] excepción enviando mail:', e)
  }

  return NextResponse.json({ ok: true })
}
