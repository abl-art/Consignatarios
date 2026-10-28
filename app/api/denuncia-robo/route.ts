import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { enviarMail } from '@/lib/mailer'
import { TOKEN_DENUNCIA, normalizarDni } from '@/lib/seguros'

export const dynamic = 'force-dynamic'

const MAX_BYTES = 10 * 1024 * 1024

// Extensión aceptada -> content-type esperado. Único punto de verdad para
// qué se acepta; el sniff de firma de abajo usa las mismas claves.
const MIME_POR_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  pdf: 'application/pdf',
}

type Firma = 'jpeg' | 'png' | 'pdf'

/**
 * Sniff barato por magic bytes — no confía en el Content-Type declarado por
 * el navegador ni en la extensión del nombre de archivo, que un cliente
 * hostil puede mentir libremente. JPEG: FF D8 FF. PNG: 89 50 4E 47. PDF:
 * "%PDF" (25 50 44 46).
 */
function firmaDeArchivo(bytes: Uint8Array): Firma | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg'
  if (bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'png'
  if (bytes.length >= 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return 'pdf'
  return null
}

function firmaEsperadaDeExtension(extension: string): Firma | null {
  if (extension === 'jpg' || extension === 'jpeg') return 'jpeg'
  if (extension === 'png') return 'png'
  if (extension === 'pdf') return 'pdf'
  return null
}

/** Solo el nombre de archivo (sin ruta) y solo caracteres seguros para una storage key. */
function nombreSanitizado(nombre: string): string {
  const base = nombre.split(/[/\\]/).pop() || 'archivo'
  const limpio = base.replace(/[^a-zA-Z0-9._-]/g, '_')
  return limpio.slice(-120) || 'archivo'
}

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
  if (archivo.size === 0) {
    return NextResponse.json({ ok: false, error: 'El archivo está vacío' }, { status: 400 })
  }
  if (archivo.size > MAX_BYTES) {
    return NextResponse.json({ ok: false, error: 'El archivo supera los 10MB' }, { status: 400 })
  }

  const extension = (archivo.name.split('.').pop() || '').toLowerCase()
  const mimeEsperado = MIME_POR_EXTENSION[extension]
  const firmaEsperada = firmaEsperadaDeExtension(extension)
  if (!mimeEsperado || !firmaEsperada) {
    return NextResponse.json({ ok: false, error: 'Formato no permitido (.jpg, .jpeg, .png, .pdf)' }, { status: 400 })
  }
  // Content-Type declarado: si el navegador mandó uno explícito que no es ni
  // el esperado ni el genérico de fallback, se rechaza antes de leer el
  // archivo entero. Algunos navegadores mandan application/octet-stream para
  // ciertos tipos de archivo — eso se tolera y se resuelve con el sniff.
  if (archivo.type && archivo.type !== mimeEsperado && archivo.type !== 'application/octet-stream') {
    return NextResponse.json({ ok: false, error: 'El tipo de archivo no coincide con la extensión' }, { status: 400 })
  }

  const bytes = new Uint8Array(await archivo.arrayBuffer())
  if (firmaDeArchivo(bytes) !== firmaEsperada) {
    return NextResponse.json({ ok: false, error: 'El contenido del archivo no coincide con su extensión' }, { status: 400 })
  }

  const dniNormalizado = normalizarDni(dniInput)
  if (!dniNormalizado) {
    return NextResponse.json({ ok: false, error: 'DNI inválido' }, { status: 400 })
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
    cert.estado === 'emitido' &&
    cert.fecha_anula === null &&
    cert.fecha_siniestro === null &&
    cert.fin_vig >= hoy
  const dniCoincide = !!cert && cert.dni !== null && normalizarDni(cert.dni) === dniNormalizado

  if (!cert || !vigente || !dniCoincide) {
    // Mismo mensaje genérico que /validar — no confirma ni niega si el
    // certificadoId existe, si está vigente o si el DNI es de otro titular.
    return NextResponse.json(
      { ok: false, error: 'No encontramos un seguro vigente para ese DNI. Revisá el número o escribinos.' },
      { status: 403 }
    )
  }

  const timestamp = Date.now()
  const path = `${cert.id}/${timestamp}-${nombreSanitizado(archivo.name)}`

  const { error: errorUpload } = await supabase.storage
    .from('denuncias-robo')
    .upload(path, bytes, { contentType: mimeEsperado })
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
