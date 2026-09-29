'use server'

// Pestaña /reclutamiento: búsquedas de personal con análisis IA.
// Lecturas y escrituras livianas acá; lo pesado (Claude, AssemblyAI, Drive)
// vive en app/api/reclutamiento/* por los tiempos de ejecución.

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { CRITERIOS_DEFAULT, type Assessment, type Criterio } from '@/lib/reclutamiento'

export interface BusquedaResumen {
  id: string
  nombre: string
  mandato: string | null
  criterios: Criterio[]
  candidatos: number
  created_at: string
}

export async function getBusquedas(): Promise<BusquedaResumen[]> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('rec_busquedas')
    .select('id, nombre, mandato, criterios, created_at, rec_candidatos(count)')
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data || []).map((b) => ({
    id: b.id,
    nombre: b.nombre,
    mandato: b.mandato,
    criterios: (b.criterios as Criterio[]) || [],
    candidatos: (b.rec_candidatos as unknown as { count: number }[])?.[0]?.count ?? 0,
    created_at: b.created_at,
  }))
}

export async function crearBusqueda(nombre: string, mandato: string): Promise<string> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('rec_busquedas')
    .insert({ nombre, mandato, criterios: CRITERIOS_DEFAULT })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  revalidatePath('/reclutamiento')
  return data.id
}

export interface EntrevistaRow {
  id: string
  titulo: string | null
  drive_link: string | null
  drive_file_id: string | null
  duracion_min: number | null
  estado: string
  analisis: Record<string, unknown> | null
  transcript: string | null
  error: string | null
  created_at: string
}

export interface CandidatoRow {
  id: string
  nombre: string
  arquetipo: string | null
  etiquetas: string[]
  resumen: string | null
  cv_path: string | null
  scores: Record<string, number>
  favor: string[]
  riesgos: string[]
  preguntas: string | null
  assessment: Assessment
  assessment_nota: string | null
  entrevistas: EntrevistaRow[]
}

export interface BusquedaCompleta {
  id: string
  nombre: string
  mandato: string | null
  criterios: Criterio[]
  recomendacion: string | null
  recomendacion_at: string | null
  candidatos: CandidatoRow[]
}

export async function getBusqueda(id: string): Promise<BusquedaCompleta | null> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('rec_busquedas')
    .select('*, rec_candidatos(*, rec_entrevistas(*))')
    .eq('id', id)
    .single()
  if (error) return null
  const candidatos: CandidatoRow[] = ((data.rec_candidatos as Record<string, unknown>[]) || [])
    .map((c) => ({
      id: c.id as string,
      nombre: c.nombre as string,
      arquetipo: (c.arquetipo as string) || null,
      etiquetas: (c.etiquetas as string[]) || [],
      resumen: (c.resumen as string) || null,
      cv_path: (c.cv_path as string) || null,
      scores: (c.scores as Record<string, number>) || {},
      favor: (c.favor as string[]) || [],
      riesgos: (c.riesgos as string[]) || [],
      preguntas: (c.preguntas as string) || null,
      assessment: (c.assessment as Assessment) || 'pendiente',
      assessment_nota: (c.assessment_nota as string) || null,
      entrevistas: ((c.rec_entrevistas as EntrevistaRow[]) || []).sort((a, b) =>
        a.created_at.localeCompare(b.created_at)
      ),
    }))
  // Orden: total de puntajes descendente
  const total = (c: CandidatoRow) => Object.values(c.scores).reduce((a, b) => a + b, 0)
  candidatos.sort((a, b) => total(b) - total(a))
  return {
    id: data.id,
    nombre: data.nombre,
    mandato: data.mandato,
    criterios: (data.criterios as Criterio[]) || [],
    recomendacion: data.recomendacion,
    recomendacion_at: data.recomendacion_at,
    candidatos,
  }
}

export interface CandidatoCompleto extends CandidatoRow {
  busqueda: { id: string; nombre: string; mandato: string | null; criterios: Criterio[] }
}

export async function getCandidato(id: string): Promise<CandidatoCompleto | null> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('rec_candidatos')
    .select('*, rec_entrevistas(*), rec_busquedas(id, nombre, mandato, criterios)')
    .eq('id', id)
    .single()
  if (error || !data) return null
  const b = data.rec_busquedas as { id: string; nombre: string; mandato: string | null; criterios: Criterio[] }
  return {
    id: data.id,
    nombre: data.nombre,
    arquetipo: data.arquetipo,
    etiquetas: (data.etiquetas as string[]) || [],
    resumen: data.resumen,
    cv_path: data.cv_path,
    scores: (data.scores as Record<string, number>) || {},
    favor: (data.favor as string[]) || [],
    riesgos: (data.riesgos as string[]) || [],
    preguntas: data.preguntas,
    assessment: (data.assessment as Assessment) || 'pendiente',
    assessment_nota: data.assessment_nota,
    entrevistas: ((data.rec_entrevistas as EntrevistaRow[]) || []).sort((a, b2) =>
      a.created_at.localeCompare(b2.created_at)
    ),
    busqueda: { id: b.id, nombre: b.nombre, mandato: b.mandato, criterios: b.criterios || [] },
  }
}

export async function setAssessment(candidatoId: string, assessment: Assessment): Promise<void> {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('rec_candidatos')
    .update({ assessment })
    .eq('id', candidatoId)
  if (error) throw new Error(error.message)
  revalidatePath('/reclutamiento')
}

export async function guardarScores(
  candidatoId: string,
  scores: Record<string, number>
): Promise<void> {
  const supabase = createAdminClient()
  const { error } = await supabase.from('rec_candidatos').update({ scores }).eq('id', candidatoId)
  if (error) throw new Error(error.message)
  revalidatePath('/reclutamiento')
}

export async function borrarCandidato(candidatoId: string): Promise<void> {
  const supabase = createAdminClient()
  const { error } = await supabase.from('rec_candidatos').delete().eq('id', candidatoId)
  if (error) throw new Error(error.message)
  revalidatePath('/reclutamiento')
}

// URL firmada del CV (bucket privado) por 1 hora
export async function urlCv(cvPath: string): Promise<string | null> {
  const supabase = createAdminClient()
  const { data } = await supabase.storage.from('cvs').createSignedUrl(cvPath, 3600)
  return data?.signedUrl || null
}
