import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { textoDeClaude, promptRecomendacion, type AnalisisEntrevista, type Criterio } from '@/lib/reclutamiento'

export const maxDuration = 120

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// Regenera la recomendación final de la búsqueda con todas las fichas y entrevistas.
export async function POST(request: NextRequest) {
  try {
    const supabaseAuth = createClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    const { busqueda_id } = (await request.json()) as { busqueda_id?: string }
    if (!busqueda_id) return NextResponse.json({ error: 'Falta busqueda_id' }, { status: 400 })

    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('rec_busquedas')
      .select('mandato, criterios, rec_candidatos(nombre, arquetipo, scores, resumen, assessment, rec_entrevistas(analisis, estado))')
      .eq('id', busqueda_id)
      .single()
    if (error || !data) return NextResponse.json({ error: 'Búsqueda no encontrada' }, { status: 404 })

    const candidatos = ((data.rec_candidatos as Record<string, unknown>[]) || []).map((c) => ({
      nombre: c.nombre as string,
      arquetipo: (c.arquetipo as string) || null,
      scores: (c.scores as Record<string, number>) || {},
      resumen: (c.resumen as string) || null,
      assessment: c.assessment as string,
      entrevistas: ((c.rec_entrevistas as { analisis: AnalisisEntrevista | null; estado: string }[]) || [])
        .filter((e) => e.estado === 'listo' && e.analisis)
        .map((e) => ({ veredicto: e.analisis!.veredicto, lectura: e.analisis!.lectura })),
    }))
    if (candidatos.length === 0) {
      return NextResponse.json({ error: 'La búsqueda no tiene candidatos todavía' }, { status: 400 })
    }

    const response = await anthropic.messages.create({
      model: 'claude-opus-5',
      max_tokens: 1500,
      messages: [
        {
          role: 'user',
          content: promptRecomendacion((data.criterios as Criterio[]) || [], data.mandato, candidatos),
        },
      ],
    })
    const recomendacion = textoDeClaude(response.content)

    await supabase
      .from('rec_busquedas')
      .update({ recomendacion, recomendacion_at: new Date().toISOString() })
      .eq('id', busqueda_id)

    return NextResponse.json({ recomendacion })
  } catch (err: unknown) {
    console.error('Error en /api/reclutamiento/recomendacion:', err)
    const message = err instanceof Error ? err.message : 'Error desconocido'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
