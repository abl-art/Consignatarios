import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { extraerDriveFileId } from '@/lib/reclutamiento'
import { descargarDeDrive, driveConfigurado } from '@/lib/google-drive'

// Streaming Drive → AssemblyAI de videos de 2-3 GB: necesita el máximo de tiempo
export const maxDuration = 300

const AAI = 'https://api.assemblyai.com/v2'

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

    const { candidato_id, drive_link, titulo } = (await request.json()) as {
      candidato_id?: string
      drive_link?: string
      titulo?: string
    }
    if (!candidato_id || !drive_link) {
      return NextResponse.json({ error: 'Faltan candidato_id o drive_link' }, { status: 400 })
    }
    const fileId = extraerDriveFileId(drive_link)
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

    if (!driveConfigurado()) {
      throw new Error(
        'Falta configurar el service account de Google Drive (GOOGLE_SA_EMAIL / GOOGLE_SA_PRIVATE_KEY). Ver documentación de la pestaña.'
      )
    }
    const apiKey = process.env.ASSEMBLYAI_API_KEY
    if (!apiKey) throw new Error('Falta ASSEMBLYAI_API_KEY en el entorno')

    // 1. Drive → AssemblyAI upload (streaming, el video nunca toca disco ni memoria completa)
    const archivo = await descargarDeDrive(fileId)
    const upload = await fetch(`${AAI}/upload`, {
      method: 'POST',
      headers: { authorization: apiKey },
      body: archivo.stream,
      // @ts-expect-error duplex es necesario para streaming en Node fetch y no está tipado
      duplex: 'half',
    })
    if (!upload.ok) throw new Error(`AssemblyAI upload falló (${upload.status}): ${await upload.text()}`)
    const { upload_url } = (await upload.json()) as { upload_url: string }

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
