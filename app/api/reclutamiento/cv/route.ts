import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { parseJsonDeClaude, promptFichaCV, type Criterio, type FichaCandidato } from '@/lib/reclutamiento'

export const maxDuration = 120

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// Sube el PDF de LinkedIn al bucket 'cvs' y genera la ficha con Claude.
export async function POST(request: NextRequest) {
  try {
    const supabaseAuth = createClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    const formData = await request.formData()
    const file = formData.get('cv') as File | null
    const busquedaId = formData.get('busqueda_id') as string | null
    if (!file || !busquedaId) {
      return NextResponse.json({ error: 'Faltan cv o busqueda_id' }, { status: 400 })
    }
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'El PDF supera los 10MB' }, { status: 400 })
    }

    const supabase = createAdminClient()
    const { data: busqueda, error: errBusqueda } = await supabase
      .from('rec_busquedas')
      .select('mandato, criterios')
      .eq('id', busquedaId)
      .single()
    if (errBusqueda || !busqueda) {
      return NextResponse.json({ error: 'Búsqueda no encontrada' }, { status: 404 })
    }
    const criterios = (busqueda.criterios as Criterio[]) || []

    const bytes = Buffer.from(await file.arrayBuffer())
    const response = await anthropic.messages.create({
      model: 'claude-opus-5',
      max_tokens: 2000,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'document',
              source: { type: 'base64', media_type: 'application/pdf', data: bytes.toString('base64') },
            },
            { type: 'text', text: promptFichaCV(criterios, busqueda.mandato) },
          ],
        },
      ],
    })
    const texto = response.content[0].type === 'text' ? response.content[0].text : ''
    const ficha = parseJsonDeClaude<FichaCandidato>(texto)

    const cvPath = `${busquedaId}/${crypto.randomUUID()}.pdf`
    const { error: errUpload } = await supabase.storage
      .from('cvs')
      .upload(cvPath, bytes, { contentType: 'application/pdf' })
    if (errUpload) throw new Error(`Storage: ${errUpload.message}`)

    const { data: candidato, error: errInsert } = await supabase
      .from('rec_candidatos')
      .insert({
        busqueda_id: busquedaId,
        nombre: ficha.nombre,
        arquetipo: ficha.arquetipo,
        etiquetas: ficha.etiquetas,
        resumen: ficha.resumen,
        cv_path: cvPath,
        scores: ficha.scores,
        favor: ficha.favor,
        riesgos: ficha.riesgos,
        preguntas: ficha.preguntas,
      })
      .select('id')
      .single()
    if (errInsert) throw new Error(errInsert.message)

    return NextResponse.json({ id: candidato.id, nombre: ficha.nombre })
  } catch (err: unknown) {
    console.error('Error en /api/reclutamiento/cv:', err)
    const message = err instanceof Error ? err.message : 'Error desconocido'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
