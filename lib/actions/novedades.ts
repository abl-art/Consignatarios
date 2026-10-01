'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'

export interface Novedad {
  id: string
  titulo: string
  detalle: string | null
  tipo: string | null
  referencia: string | null
  created_at: string
  leida_at: string | null
  /** Id externo de Pedro (contrato v2) — es lo que va en en_respuesta_a al responderle */
  id_externo: string | null
  /** Si Pedro respondió a una novedad nuestra: id en novedades_enviadas */
  en_respuesta_a: string | null
  /** Título de la novedad nuestra a la que responde (resuelto acá) */
  respuestaATitulo: string | null
}

export async function getNovedades(limit = 30): Promise<Novedad[]> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('novedades_gocelular')
    .select('id, titulo, detalle, tipo, referencia, created_at, leida_at, id_externo, en_respuesta_a')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) {
    console.error('getNovedades:', error.message)
    return []
  }
  const filas = data ?? []

  // Resolver a qué novedad nuestra responde cada una (contrato v2)
  const refs = [...new Set(filas.map(f => f.en_respuesta_a).filter((v): v is string => v !== null))]
  const titulos = new Map<string, string>()
  if (refs.length > 0) {
    const { data: enviadas } = await supabase.from('novedades_enviadas').select('id, titulo').in('id', refs)
    for (const e of enviadas ?? []) titulos.set(e.id, e.titulo)
  }
  return filas.map(f => ({ ...f, respuestaATitulo: f.en_respuesta_a ? titulos.get(f.en_respuesta_a) ?? null : null }))
}

// Cantidad de novedades sin leer, para el aviso del sidebar
export async function contarNovedadesNoLeidas(): Promise<number> {
  const supabase = createAdminClient()
  const { count, error } = await supabase
    .from('novedades_gocelular')
    .select('id', { count: 'exact', head: true })
    .is('leida_at', null)
  if (error) {
    console.error('contarNovedadesNoLeidas:', error.message)
    return 0
  }
  return count ?? 0
}

export async function marcarNovedadesLeidas(ids: string[]): Promise<{ ok: boolean }> {
  if (ids.length === 0) return { ok: true }
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('novedades_gocelular')
    .update({ leida_at: new Date().toISOString() })
    .in('id', ids)
    .is('leida_at', null)
  if (error) {
    console.error('marcarNovedadesLeidas:', error.message)
    return { ok: false }
  }
  revalidatePath('/novedades')
  revalidatePath('/', 'layout') // refresca el aviso del sidebar
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Novedades SALIENTES hacia GOcelular (espejo del webhook de Pedro).
// URL del receptor en flujo_config 'gocelular_novedades_url'; misma firma
// HMAC compartida que los demás webhooks salientes.
// ---------------------------------------------------------------------------

import { signWebhook, buildTimestamp } from '@/lib/gocelular-webhook'
import { validarNovedadSaliente, armarNovedadSaliente, type NovedadSalienteInput } from '@/lib/novedades-salientes'

export interface NovedadEnviada {
  id: string
  titulo: string
  detalle: string | null
  tipo: string | null
  referencia: string | null
  estado: 'borrador' | 'enviada' | 'fallida'
  respuesta: string | null
  enviada_at: string | null
  created_at: string
  en_respuesta_a: string | null
}

export async function getNovedadesEnviadas(limit = 50): Promise<NovedadEnviada[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('novedades_enviadas')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)
  return (data ?? []) as NovedadEnviada[]
}

async function postNovedadAGocelular(payload: Record<string, string>): Promise<{ ok: boolean; respuesta: string }> {
  // Secret PROPIO de esta dirección (ajuste de Pedro 30/9: un secret por
  // dirección evita que una novedad nuestra se replaye contra nuestro endpoint)
  const secret = process.env.GOCELULAR_NOVEDADES_SECRET
  if (!secret) return { ok: false, respuesta: 'GOCELULAR_NOVEDADES_SECRET sin configurar (secret de la dirección 360→GOcelular)' }

  const admin = createAdminClient()
  const { data: config } = await admin.from('flujo_config').select('value').eq('key', 'gocelular_novedades_url').maybeSingle()
  const url = typeof config?.value === 'string' ? config.value : ''
  if (!url) return { ok: false, respuesta: 'Falta la URL del endpoint de Pedro (flujo_config gocelular_novedades_url) — reintentar cuando la confirme' }

  const rawBody = JSON.stringify(payload)
  const ts = buildTimestamp()
  const sig = signWebhook(secret, ts, rawBody)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Gocelular-Signature': sig,
        'X-Gocelular-Timestamp': ts,
      },
      body: rawBody,
      signal: AbortSignal.timeout(15000),
    })
    const texto = (await res.text().catch(() => '')).slice(0, 300)
    if (res.ok) return { ok: true, respuesta: `HTTP ${res.status}${texto ? ` · ${texto}` : ''}` }
    return { ok: false, respuesta: `HTTP ${res.status}${texto ? ` · ${texto}` : ''}` }
  } catch (e) {
    return { ok: false, respuesta: `Sin respuesta: ${e instanceof Error ? e.message : 'error de red'}` }
  }
}

export async function enviarNovedadGocelular(input: NovedadSalienteInput): Promise<{ ok: boolean; error?: string }> {
  const errores = validarNovedadSaliente(input)
  if (errores.length > 0) return { ok: false, error: errores.join(' · ') }

  const base = armarNovedadSaliente(input)
  const admin = createAdminClient()
  const { data: fila, error: errIns } = await admin
    .from('novedades_enviadas')
    .insert({
      titulo: base.titulo,
      detalle: base.detalle ?? null,
      tipo: base.tipo ?? null,
      referencia: base.referencia ?? null,
      en_respuesta_a: base.en_respuesta_a ?? null,
      estado: 'fallida',
    })
    .select('id')
    .single()
  if (errIns || !fila) return { ok: false, error: `No se pudo guardar la novedad: ${errIns?.message}` }

  // id estable = uuid de la fila (contrato v2: dedup de reintentos del lado de Pedro)
  const payload = { ...base, id: fila.id as string }
  const envio = await postNovedadAGocelular(payload)
  await admin
    .from('novedades_enviadas')
    .update({ estado: envio.ok ? 'enviada' : 'fallida', respuesta: envio.respuesta, enviada_at: envio.ok ? new Date().toISOString() : null })
    .eq('id', fila.id)

  revalidatePath('/novedades')
  return envio.ok ? { ok: true } : { ok: false, error: envio.respuesta }
}

export async function reintentarNovedadGocelular(id: string): Promise<{ ok: boolean; error?: string }> {
  const admin = createAdminClient()
  const { data: fila } = await admin.from('novedades_enviadas').select('*').eq('id', id).maybeSingle()
  if (!fila) return { ok: false, error: 'Novedad no encontrada' }
  if (fila.estado === 'enviada') return { ok: true }

  const payload = armarNovedadSaliente({
    titulo: fila.titulo,
    detalle: fila.detalle ?? undefined,
    tipo: fila.tipo ?? undefined,
    referencia: fila.referencia ?? undefined,
    id: fila.id,
    enRespuestaA: fila.en_respuesta_a ?? undefined,
  })
  const envio = await postNovedadAGocelular(payload)
  await admin
    .from('novedades_enviadas')
    .update({ estado: envio.ok ? 'enviada' : 'fallida', respuesta: envio.respuesta, enviada_at: envio.ok ? new Date().toISOString() : null })
    .eq('id', id)

  revalidatePath('/novedades')
  return envio.ok ? { ok: true } : { ok: false, error: envio.respuesta }
}

/**
 * Borrador de novedad (lo usa la tool redactar_novedad de Celia): queda en
 * novedades_enviadas con estado 'borrador' y Emiliano lo envía con un click
 * desde /novedades → Enviadas. Nada sale sin aprobación humana.
 */
export async function crearBorradorNovedad(input: NovedadSalienteInput): Promise<{ ok: boolean; id?: string; error?: string }> {
  const errores = validarNovedadSaliente(input)
  if (errores.length > 0) return { ok: false, error: errores.join(' · ') }

  const admin = createAdminClient()

  // Si responde a una novedad de Pedro, el id tiene que ser uno que él mandó
  if (input.enRespuestaA) {
    const { data: original } = await admin
      .from('novedades_gocelular')
      .select('id')
      .eq('id_externo', input.enRespuestaA.trim())
      .maybeSingle()
    if (!original) {
      return { ok: false, error: `No existe ninguna novedad recibida con id_externo ${input.enRespuestaA} — en_respuesta_a debe ser el id_externo de una novedad de GOcelular (las anteriores al contrato v2 no tienen)` }
    }
  }

  const base = armarNovedadSaliente(input)
  const { data: fila, error } = await admin
    .from('novedades_enviadas')
    .insert({
      titulo: base.titulo,
      detalle: base.detalle ?? null,
      tipo: base.tipo ?? null,
      referencia: base.referencia ?? null,
      en_respuesta_a: base.en_respuesta_a ?? null,
      estado: 'borrador',
    })
    .select('id')
    .single()
  if (error || !fila) return { ok: false, error: `No se pudo guardar el borrador: ${error?.message}` }

  revalidatePath('/novedades')
  return { ok: true, id: fila.id }
}

export async function descartarBorradorNovedad(id: string): Promise<{ ok: boolean; error?: string }> {
  const admin = createAdminClient()
  const { error, count } = await admin
    .from('novedades_enviadas')
    .delete({ count: 'exact' })
    .eq('id', id)
    .eq('estado', 'borrador')
  if (error) return { ok: false, error: error.message }
  if (!count) return { ok: false, error: 'Solo se pueden descartar borradores' }
  revalidatePath('/novedades')
  return { ok: true }
}
