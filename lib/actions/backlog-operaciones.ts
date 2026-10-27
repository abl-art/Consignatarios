'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { enviarMail } from '@/lib/mailer'
import {
  armarMailBacklog,
  todoDeCompletada,
  type PrioridadBacklog,
  type TareaBacklog,
} from '@/lib/backlog-operaciones'

const DESTINATARIA = process.env.BACKLOG_MAIL_PARA || 'yamila@gocuotas.com'

function mapear(r: Record<string, unknown>): TareaBacklog {
  return {
    id: r.id as string,
    titulo: r.titulo as string,
    detalle: (r.detalle as string) ?? null,
    prioridad: r.prioridad as PrioridadBacklog,
    creadoAt: r.creado_at as string,
    realizadoAt: (r.realizado_at as string) ?? null,
    mailEnviadoAt: (r.mail_enviado_at as string) ?? null,
  }
}

export async function getBacklog(): Promise<TareaBacklog[]> {
  const admin = createAdminClient()
  const { data } = await admin.from('backlog_operaciones').select('*').order('creado_at', { ascending: true })
  return (data ?? []).map(mapear)
}

/** Crea la tarea y le avisa a Yami por mail. Si el mail falla, la tarea queda igual (se reintenta al reenviar). */
export async function crearTareaBacklog(
  titulo: string,
  detalle: string,
  prioridad: PrioridadBacklog,
): Promise<{ ok?: true; mailError?: string; error?: string }> {
  const limpio = titulo.trim()
  if (!limpio) return { error: 'Escribí la tarea.' }
  if (!['urgente', 'durante_dia', 'puede_esperar'].includes(prioridad)) return { error: 'Prioridad inválida.' }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('backlog_operaciones')
    .insert({ titulo: limpio, detalle: detalle.trim() || null, prioridad })
    .select('id')
    .single()
  if (error) return { error: error.message }

  const mail = armarMailBacklog({ titulo: limpio, detalle: detalle.trim() || null, prioridad })
  const envio = await enviarMail({ para: DESTINATARIA, asunto: mail.asunto, texto: mail.cuerpo })
  if (envio.ok) {
    await admin.from('backlog_operaciones').update({ mail_enviado_at: new Date().toISOString() }).eq('id', data.id)
  }
  revalidatePath('/notas')
  return envio.ok ? { ok: true } : { ok: true, mailError: `La tarea se creó pero el mail falló: ${envio.error}` }
}

/** Reintenta el aviso por mail de una tarea cuyo envío falló. */
export async function reenviarMailBacklog(id: string): Promise<{ ok?: true; error?: string }> {
  const admin = createAdminClient()
  const { data: fila } = await admin.from('backlog_operaciones').select('*').eq('id', id).single()
  if (!fila) return { error: 'Tarea no encontrada.' }
  const t = mapear(fila)
  const mail = armarMailBacklog(t)
  const envio = await enviarMail({ para: DESTINATARIA, asunto: mail.asunto, texto: mail.cuerpo })
  if (!envio.ok) return { error: envio.error }
  await admin.from('backlog_operaciones').update({ mail_enviado_at: new Date().toISOString() }).eq('id', id)
  revalidatePath('/notas')
  return { ok: true }
}

/**
 * Yami marca la tarea como realizada: se cierra y se le carga a Emiliano un
 * ToDo en la fecha de HOY (app_todos, mismo merge por id que usa /notas —
 * el id estable backlog-<id> evita duplicados si se re-marca).
 */
export async function marcarRealizadaBacklog(id: string): Promise<{ ok?: true; error?: string }> {
  const admin = createAdminClient()
  const { data: fila } = await admin.from('backlog_operaciones').select('*').eq('id', id).single()
  if (!fila) return { error: 'Tarea no encontrada.' }
  if (fila.realizado_at) return { error: 'Ya estaba marcada como realizada.' }

  const { error } = await admin
    .from('backlog_operaciones')
    .update({ realizado_at: new Date().toISOString() })
    .eq('id', id)
  if (error) return { error: error.message }

  // ToDo para Emiliano el día de la completación (merge manual sobre app_todos)
  const hoy = new Date().toISOString().slice(0, 10)
  const nuevo = todoDeCompletada({ id, titulo: fila.titulo as string })
  const { data: cfg } = await admin.from('flujo_config').select('value').eq('key', 'app_todos').single()
  const todos: Record<string, { id: string; text: string; done: boolean }[]> = cfg?.value ? JSON.parse(cfg.value) : {}
  const dia = Array.isArray(todos[hoy]) ? todos[hoy] : []
  if (!dia.some(t => t.id === nuevo.id)) todos[hoy] = [...dia, nuevo]
  await admin.from('flujo_config').upsert({ key: 'app_todos', value: JSON.stringify(todos), updated_at: new Date().toISOString() })

  revalidatePath('/notas')
  return { ok: true }
}

/** Borra una tarea pendiente cargada por error (las realizadas quedan como historial). */
export async function borrarTareaBacklog(id: string): Promise<{ ok?: true; error?: string }> {
  const admin = createAdminClient()
  const { data: fila } = await admin.from('backlog_operaciones').select('realizado_at').eq('id', id).single()
  if (!fila) return { error: 'Tarea no encontrada.' }
  if (fila.realizado_at) return { error: 'Las realizadas quedan como historial.' }
  const { error } = await admin.from('backlog_operaciones').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/notas')
  return { ok: true }
}
