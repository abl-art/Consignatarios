import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  parseJsonDeClaude,
  textoDeClaude,
  promptEntrevistaPersonal,
  type AnalisisEntrevista,
  type Criterio,
  type EntrevistaPersonal,
  type PreguntaPersonal,
} from '@/lib/reclutamiento'

export const maxDuration = 120

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// Genera (o regenera) la guía de entrevista personal del candidato con Claude
// a partir de su ficha + lo que dejaron las entrevistas técnicas. Regenerar
// pisa las respuestas cargadas: el botón de la UI lo confirma en 2 pasos.
export async function POST(request: NextRequest) {
  try {
    const supabaseAuth = createClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    const { candidato_id: candidatoId } = (await request.json()) as { candidato_id?: string }
    if (!candidatoId) return NextResponse.json({ error: 'Falta candidato_id' }, { status: 400 })

    const supabase = createAdminClient()
    const { data: c, error } = await supabase
      .from('rec_candidatos')
      .select('nombre, arquetipo, resumen, favor, riesgos, preguntas, rec_entrevistas(analisis, estado), rec_busquedas(mandato, criterios)')
      .eq('id', candidatoId)
      .single()
    if (error || !c) return NextResponse.json({ error: 'Candidato no encontrado' }, { status: 404 })

    const busqueda = c.rec_busquedas as unknown as { mandato: string | null; criterios: Criterio[] | null }
    const tecnicas = ((c.rec_entrevistas as { analisis: AnalisisEntrevista | null; estado: string }[]) || [])
      .filter((e) => e.estado === 'listo' && e.analisis)
      .map((e) => ({
        veredicto: e.analisis!.veredicto,
        bien: e.analisis!.bien,
        mal: e.analisis!.mal,
        lectura: e.analisis!.lectura,
      }))

    const prompt = promptEntrevistaPersonal(
      busqueda.criterios || [],
      busqueda.mandato,
      {
        nombre: c.nombre,
        arquetipo: c.arquetipo,
        resumen: c.resumen,
        favor: (c.favor as string[]) || [],
        riesgos: (c.riesgos as string[]) || [],
        preguntas: c.preguntas,
      },
      tecnicas
    )

    const response = await anthropic.messages.create({
      model: 'claude-opus-5',
      max_tokens: 3000,
      messages: [{ role: 'user', content: prompt }],
    })
    const parsed = parseJsonDeClaude<{ preguntas: Omit<PreguntaPersonal, 'id'>[] }>(textoDeClaude(response.content))
    if (!parsed.preguntas || parsed.preguntas.length === 0) {
      return NextResponse.json({ error: 'Claude no devolvió preguntas' }, { status: 502 })
    }

    const entrevista: EntrevistaPersonal = {
      generada_at: new Date().toISOString(),
      preguntas: parsed.preguntas.map((p, i) => ({ id: `p${i + 1}`, tema: p.tema, pregunta: p.pregunta, busca: p.busca })),
      respuestas: {},
    }

    const { error: errUpdate } = await supabase
      .from('rec_candidatos')
      .update({ entrevista_personal: entrevista })
      .eq('id', candidatoId)
    if (errUpdate) throw new Error(errUpdate.message)

    return NextResponse.json({ ok: true, preguntas: entrevista.preguntas.length })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
