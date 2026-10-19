import { request as httpsRequest } from 'node:https'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { ReadableStream as NodeWebReadableStream } from 'node:stream/web'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { extraerDriveFileId } from '@/lib/reclutamiento'
import { descargarDeDrive, driveConfigurado } from '@/lib/google-drive'

// Streaming Drive → AssemblyAI de videos de 2-3 GB: necesita el máximo de tiempo
export const maxDuration = 300

const AAI = 'https://api.assemblyai.com/v2'

// Upload con node:https + pipeline y NO con fetch: undici no aplica backpressure
// al cuerpo del request — bufferea en RAM todo lo que Drive entrega y AssemblyAI
// aún no aceptó, y con videos >1GB la función muere por memoria (verificado en
// logs: "instance was killed because it ran out of available memory", RSS 1:1
// con lo descargado). Con pipeline, el socket lleno pausa la descarga de Drive.
async function subirAAssemblyAI(stream: ReadableStream<Uint8Array>, apiKey: string): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const req = httpsRequest(
      `${AAI}/upload`,
      {
        method: 'POST',
        headers: { authorization: apiKey, 'content-type': 'application/octet-stream' },
      },
      (res) => {
        let body = ''
        res.on('data', (c) => (body += c))
        res.on('end', () => {
          if (res.statusCode !== 200) {
            return reject(new Error(`AssemblyAI upload falló (${res.statusCode}): ${body.slice(0, 300)}`))
          }
          try {
            resolve((JSON.parse(body) as { upload_url: string }).upload_url)
          } catch {
            reject(new Error(`AssemblyAI upload devolvió una respuesta no-JSON: ${body.slice(0, 300)}`))
          }
        })
      }
    )
    req.on('error', reject)
    pipeline(Readable.fromWeb(stream as unknown as NodeWebReadableStream<Uint8Array>), req).catch(reject)
  })
}

// Registra la entrevista (link de Drive privado) y arranca la transcripción:
// descarga el video del Drive de Emiliano vía service account (nunca se hace
// público) y lo sube en streaming al endpoint privado de AssemblyAI.
export async function POST(request: NextRequest) {
  const supabase = createAdminClient()
  let entrevistaId: string | null = null
  try {
    const supabaseAuth = createClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    const { candidato_id, drive_link, titulo, entrevista_id } = (await request.json()) as {
      candidato_id?: string
      drive_link?: string
      titulo?: string
      entrevista_id?: string
    }

    let fileId: string | null = null
    if (entrevista_id) {
      // Reintento: reprocesar una fila existente (quedó en pendiente/error si la
      // función anterior murió sin llegar al catch — p.ej. varios videos a la vez)
      const { data: existente, error: errGet } = await supabase
        .from('rec_entrevistas')
        .select('id, drive_file_id, estado')
        .eq('id', entrevista_id)
        .single()
      if (errGet || !existente) {
        return NextResponse.json({ error: 'Entrevista no encontrada' }, { status: 404 })
      }
      if (existente.estado === 'transcribiendo' || existente.estado === 'analizando') {
        return NextResponse.json({ error: 'Esa entrevista ya se está procesando' }, { status: 409 })
      }
      fileId = existente.drive_file_id
      entrevistaId = existente.id
      await supabase
        .from('rec_entrevistas')
        .update({ estado: 'pendiente', error: null, updated_at: new Date().toISOString() })
        .eq('id', entrevistaId)
    } else {
      if (!candidato_id || !drive_link) {
        return NextResponse.json({ error: 'Faltan candidato_id o drive_link' }, { status: 400 })
      }
      fileId = extraerDriveFileId(drive_link)
      if (!fileId) {
        return NextResponse.json(
          { error: 'No pude extraer el ID del link de Drive. Pegá el link completo del archivo.' },
          { status: 400 }
        )
      }

      const { data: fila, error: errInsert } = await supabase
        .from('rec_entrevistas')
        .insert({
          candidato_id,
          titulo: titulo || null,
          drive_link,
          drive_file_id: fileId,
          estado: 'pendiente',
        })
        .select('id')
        .single()
      if (errInsert) throw new Error(errInsert.message)
      entrevistaId = fila.id
    }
    if (!fileId) throw new Error('La entrevista no tiene archivo de Drive asociado')

    if (!driveConfigurado()) {
      throw new Error(
        'Falta configurar el service account de Google Drive (GOOGLE_SA_EMAIL / GOOGLE_SA_PRIVATE_KEY). Ver documentación de la pestaña.'
      )
    }
    const apiKey = process.env.ASSEMBLYAI_API_KEY
    if (!apiKey) throw new Error('Falta ASSEMBLYAI_API_KEY en el entorno')

    // 1. Drive → AssemblyAI upload (streaming con backpressure, el video nunca
    // toca disco ni se materializa completo en memoria)
    const archivo = await descargarDeDrive(fileId)
    const upload_url = await subirAAssemblyAI(archivo.stream, apiKey)

    // 2. Crear el job de transcripción en español
    const job = await fetch(`${AAI}/transcript`, {
      method: 'POST',
      headers: { authorization: apiKey, 'content-type': 'application/json' },
      body: JSON.stringify({ audio_url: upload_url, language_code: 'es' }),
    })
    if (!job.ok) throw new Error(`AssemblyAI transcript falló (${job.status}): ${await job.text()}`)
    const jobData = (await job.json()) as { id: string }

    await supabase
      .from('rec_entrevistas')
      .update({ assemblyai_id: jobData.id, estado: 'transcribiendo', updated_at: new Date().toISOString() })
      .eq('id', entrevistaId)

    return NextResponse.json({ id: entrevistaId, estado: 'transcribiendo' })
  } catch (err: unknown) {
    console.error('Error en /api/reclutamiento/entrevista:', err)
    const message = err instanceof Error ? err.message : 'Error desconocido'
    if (entrevistaId) {
      await supabase
        .from('rec_entrevistas')
        .update({ estado: 'error', error: message, updated_at: new Date().toISOString() })
        .eq('id', entrevistaId)
    }
    return NextResponse.json({ error: message, id: entrevistaId }, { status: 500 })
  }
}
