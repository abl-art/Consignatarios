import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  parseJsonDeClaude,
  textoDeClaude,
  promptAnalisisEntrevista,
  type AnalisisEntrevista,
  type Criterio,
} from '@/lib/reclutamiento'

// El análisis con Opus de un transcript de 30 min puede tardar >60s
export const maxDuration = 300

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// Polling del estado de la transcripción. Cuando AssemblyAI termina, guarda el
// transcript y corre el análisis de reclutador con Claude en la misma llamada.
// La página del candidato pega acá cada ~15s mientras estado != listo/error.
export async function GET(request: NextRequest) {
  try {
    const supabaseAuth = createClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    const id = request.nextUrl.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })

    const supabase = createAdminClient()
    const { data: fila, error } = await supabase
      .from('rec_entrevistas')
      .select('*, rec_candidatos(nombre, resumen, scores, busqueda_id)')
      .eq('id', id)
      .single()
    if (error || !fila) return NextResponse.json({ error: 'Entrevista no encontrada' }, { status: 404 })

    if (fila.estado === 'listo' || fila.estado === 'error' || fila.estado === 'pendiente') {
      return NextResponse.json({ estado: fila.estado, error: fila.error })
    }

    // estado transcribiendo → consultar AssemblyAI
    if (fila.estado === 'transcribiendo') {
      const res = await fetch(`https://api.assemblyai.com/v2/transcript/${fila.assemblyai_id}`, {
        headers: { authorization: process.env.ASSEMBLYAI_API_KEY! },
      })
      if (!res.ok) throw new Error(`AssemblyAI status falló (${res.status})`)
      const job = (await res.json()) as {
        status: string
        text: string | null
        audio_duration: number | null
        error?: string
      }
      if (job.status === 'error') {
        await supabase
          .from('rec_entrevistas')
          .update({ estado: 'error', error: job.error || 'Transcripción falló', updated_at: new Date().toISOString() })
          .eq('id', id)
        return NextResponse.json({ estado: 'error', error: job.error })
      }
      if (job.status !== 'completed') {
        return NextResponse.json({ estado: 'transcribiendo' })
      }
      await supabase
        .from('rec_entrevistas')
        .update({
          transcript: job.text,
          duracion_min: job.audio_duration ? Math.round(job.audio_duration / 6) / 10 : null,
          estado: 'analizando',
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
      fila.transcript = job.text
    }

    // estado analizando (o recién transcripto) → análisis con Claude
    const candidato = fila.rec_candidatos as {
      nombre: string
      resumen: string | null
      scores: Record<string, number>
      busqueda_id: string
    }
    const { data: busqueda } = await supabase
      .from('rec_busquedas')
      .select('mandato, criterios')
      .eq('id', candidato.busqueda_id)
      .single()
    const criterios = ((busqueda?.criterios as Criterio[]) || [])

    const response = await anthropic.messages.create({
      model: 'claude-opus-5',
      max_tokens: 3000,
      messages: [
        {
          role: 'user',
          content: promptAnalisisEntrevista(criterios, busqueda?.mandato || null, candidato, fila.transcript || ''),
        },
      ],
    })
    const texto = textoDeClaude(response.content)
    const analisis = parseJsonDeClaude<AnalisisEntrevista & { scores_sugeridos?: Record<string, number> }>(texto)

    await supabase
      .from('rec_entrevistas')
      .update({ analisis, estado: 'listo', updated_at: new Date().toISOString() })
      .eq('id', id)

    // Los puntajes del cuadro combinan CV + entrevista: aplicar los ajustes
    // que la entrevista justifica (el admin puede retocarlos a mano después)
    if (analisis.scores_sugeridos && Object.keys(analisis.scores_sugeridos).length > 0) {
      const claves = new Set(criterios.map((c) => c.clave))
      const ajustes = Object.fromEntries(
        Object.entries(analisis.scores_sugeridos).filter(
          ([k, v]) => claves.has(k) && v >= 1 && v <= 5
        )
      )
      if (Object.keys(ajustes).length > 0) {
        await supabase
          .from('rec_candidatos')
          .update({ scores: { ...candidato.scores, ...ajustes } })
          .eq('id', fila.candidato_id)
      }
    }

    return NextResponse.json({ estado: 'listo', analisis })
  } catch (err: unknown) {
    console.error('Error en /api/reclutamiento/entrevista/estado:', err)
    const message = err instanceof Error ? err.message : 'Error desconocido'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
