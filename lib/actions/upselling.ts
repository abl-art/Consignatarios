'use server'

// /upselling: clientes con todas las cuotas pagas (réplica GOcelular),
// teléfono verificado desde la base directa de GOcuotas (users.phone_number)
// y seguimiento manual (contactado + nota) en Supabase upselling_seguimiento.

import { revalidatePath } from 'next/cache'
import { getPool, getGocuotasPool } from '@/lib/db-pool'
import { createAdminClient } from '@/lib/supabase/admin'
import { SQL_IDS_TODOS, CLIENT_IDS_PROPIOS } from '@/lib/client-ids'
import {
  armarUpselling,
  type FilaUpselling,
  type OrdenPagaRaw,
  type OrdenClienteRaw,
  type SeguimientoRaw,
} from '@/lib/upselling'

export interface UpsellingData {
  filas: (FilaUpselling & { canal: 'Propio' | 'Tercero' })[]
  error: string | null
}

export async function getUpselling(): Promise<UpsellingData> {
  const pool = getPool()
  if (!pool) return { filas: [], error: 'Sin conexión a GOcelular' }

  try {
    const client = await pool.connect()
    let pagas: (OrdenPagaRaw & { clientId: string })[]
    let ordenes: OrdenClienteRaw[]
    try {
      const pagasRes = await client.query(
        `WITH pagas AS (
           SELECT i.order_id, MAX(i.installment_collected_at) AS ultima, COUNT(*)::int AS cuotas
           FROM gocuotas_installments i
           WHERE i.installment_discarded_at IS NULL
           GROUP BY i.order_id
           HAVING COUNT(*) FILTER (WHERE i.payment_status <> 'paid') = 0 AND COUNT(*) > 0
         )
         SELECT go.order_id, go.user_id, go.user_name, go.user_dni::text AS dni, go.client_id::text AS client_id,
                p.ultima, p.cuotas,
                CASE WHEN go.total_order_amount > 5000000 THEN go.total_order_amount / 100.0 ELSE go.total_order_amount END AS monto,
                so.product_name
         FROM pagas p
         JOIN gocuotas_orders go ON go.order_id = p.order_id AND go.order_discarded_at IS NULL
         LEFT JOIN store_orders so ON so.gocuotas_order_id::text = go.order_id::text
         WHERE go.client_id::text IN (${SQL_IDS_TODOS})`
      )
      pagas = pagasRes.rows.map(r => ({
        orderId: String(r.order_id),
        userId: String(r.user_id),
        nombre: r.user_name ?? '',
        dni: r.dni ?? '',
        clientId: r.client_id,
        producto: r.product_name ?? null,
        ultimaCuotaAt: r.ultima ? new Date(r.ultima).toISOString() : null,
        cuotas: Number(r.cuotas),
        monto: Number(r.monto),
      }))

      // Todas las órdenes de esos clientes (para detectar recompra post-contacto)
      const userIds = Array.from(new Set(pagas.map(p => p.userId)))
      const ordRes = await client.query(
        `SELECT go.order_id, go.user_id, go.order_created_at, so.product_name
         FROM gocuotas_orders go
         LEFT JOIN store_orders so ON so.gocuotas_order_id::text = go.order_id::text
         WHERE go.order_discarded_at IS NULL
           AND go.client_id::text IN (${SQL_IDS_TODOS})
           AND go.user_id::text = ANY($1)`,
        [userIds]
      )
      ordenes = ordRes.rows.map(r => ({
        orderId: String(r.order_id),
        userId: String(r.user_id),
        createdAt: new Date(r.order_created_at).toISOString(),
        producto: r.product_name ?? null,
      }))
    } finally {
      client.release()
    }

    // Teléfono verificado desde la base directa de GOcuotas
    const telefonos: Record<string, string> = {}
    const gcPool = getGocuotasPool()
    if (gcPool) {
      const gc = await gcPool.connect()
      try {
        const telRes = await gc.query(
          `SELECT id::text AS user_id, phone_number FROM users WHERE id::text = ANY($1) AND phone_number IS NOT NULL AND phone_number <> ''`,
          [Array.from(new Set(pagas.map(p => p.userId)))]
        )
        for (const r of telRes.rows) telefonos[r.user_id] = r.phone_number
      } finally {
        gc.release()
      }
    }

    // Seguimiento manual en Supabase
    const supabase = createAdminClient()
    const { data: seg } = await supabase
      .from('upselling_seguimiento')
      .select('user_id, contactado_at, nota')
    const seguimiento: SeguimientoRaw[] = (seg ?? []).map(s => ({
      userId: s.user_id as string,
      contactadoAt: s.contactado_at as string | null,
      nota: s.nota as string | null,
    }))

    const canalPorUser = new Map<string, 'Propio' | 'Tercero'>()
    for (const p of pagas) {
      // Con órdenes en ambos canales pesa el propio (es cliente directo)
      if (CLIENT_IDS_PROPIOS.includes(p.clientId) || !canalPorUser.has(p.userId)) {
        canalPorUser.set(p.userId, CLIENT_IDS_PROPIOS.includes(p.clientId) ? 'Propio' : 'Tercero')
      }
    }

    const filas = armarUpselling(pagas, telefonos, ordenes, seguimiento).map(f => ({
      ...f,
      canal: canalPorUser.get(f.userId) ?? ('Tercero' as const),
    }))
    return { filas, error: null }
  } catch (e: unknown) {
    return { filas: [], error: e instanceof Error ? e.message : String(e) }
  }
}

export async function setContactado(userId: string, contactado: boolean) {
  const supabase = createAdminClient()
  const { error } = await supabase.from('upselling_seguimiento').upsert({
    user_id: userId,
    contactado_at: contactado ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  })
  if (error) return { error: error.message }
  revalidatePath('/upselling')
  return { ok: true }
}

export async function setNotaUpselling(userId: string, nota: string) {
  const supabase = createAdminClient()
  const { error } = await supabase.from('upselling_seguimiento').upsert({
    user_id: userId,
    nota: nota.trim() || null,
    updated_at: new Date().toISOString(),
  })
  if (error) return { error: error.message }
  revalidatePath('/upselling')
  return { ok: true }
}
