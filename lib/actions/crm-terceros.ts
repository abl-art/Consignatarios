'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getPool } from '@/lib/db-pool'
import { CLIENT_IDS_PROPIOS } from '@/lib/client-ids'
import { revalidatePath } from 'next/cache'
import { diaHabilSiguiente } from '@/lib/utils'

export interface Prospecto {
  id: string
  nombre: string
  contacto: string
  asignado: string
  sucursales: number
  estado: 'prospecto' | 'propuesta' | 'ganado' | 'perdido'
  prospecto_at: string
  propuesta_at: string | null
  ganado_at: string | null
  perdido_at: string | null
  created_at: string
}

export interface ProspectoStats {
  estado: string
  count: number
  sucursales: number
  tiempoPromedio: number
}

export interface TerceroAlta {
  clientId: string
  merchantName: string
  tiendas: number
  ventasCantidad: number
  ventasMonto: number
  ventasAyerCantidad: number
  ventasAyerMonto: number
}

export interface VentaDiariaTercero {
  clientId: string
  merchantName: string
  fecha: string
  cantidad: number
  monto: number
}

// Merchant names se obtienen dinámicamente de gocuotas_stores

export async function fetchProspectos(): Promise<Prospecto[]> {
  const sb = createAdminClient()
  const { data } = await sb.from('crm_prospectos').select('*').order('created_at', { ascending: true })
  return (data ?? []) as Prospecto[]
}

export async function fetchProspectoStats(prospectos: Prospecto[]): Promise<ProspectoStats[]> {
  const estados = ['prospecto', 'propuesta', 'ganado', 'perdido'] as const
  const now = Date.now()

  return estados.map(estado => {
    const enEstado = prospectos.filter(p => p.estado === estado)
    const count = enEstado.length
    const sucursales = enEstado.reduce((s, p) => s + p.sucursales, 0)

    const tiempos: number[] = []
    for (const p of prospectos) {
      let entrada: string | null = null
      let salida: string | null = null

      if (estado === 'prospecto') {
        entrada = p.prospecto_at
        salida = p.propuesta_at ?? p.ganado_at ?? p.perdido_at
      } else if (estado === 'propuesta') {
        entrada = p.propuesta_at
        salida = p.ganado_at ?? p.perdido_at
      } else if (estado === 'ganado') {
        entrada = p.ganado_at
        salida = null
      } else if (estado === 'perdido') {
        entrada = p.perdido_at
        salida = null
      }

      if (!entrada) continue
      const fin = salida ? new Date(salida).getTime() : now
      tiempos.push((fin - new Date(entrada).getTime()) / (1000 * 60 * 60 * 24))
    }

    const tiempoPromedio = tiempos.length > 0
      ? Math.round(tiempos.reduce((a, b) => a + b, 0) / tiempos.length * 10) / 10
      : 0

    return { estado, count, sucursales, tiempoPromedio }
  })
}

export async function crearProspecto(nombre: string, sucursales: number, contacto: string, asignado: string): Promise<{ ok: true } | { error: string }> {
  const sb = createAdminClient()
  const { error } = await sb.from('crm_prospectos').insert({ nombre, sucursales, contacto, asignado })
  if (error) return { error: error.message }
  revalidatePath('/terceros/crm')
  return { ok: true }
}

export async function actualizarSucursales(id: string, sucursales: number): Promise<{ ok: true } | { error: string }> {
  const sb = createAdminClient()
  const { error } = await sb.from('crm_prospectos').update({ sucursales }).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/terceros/crm')
  return { ok: true }
}

export async function actualizarContacto(id: string, contacto: string): Promise<{ ok: true } | { error: string }> {
  const sb = createAdminClient()
  const { error } = await sb.from('crm_prospectos').update({ contacto }).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/terceros/crm')
  return { ok: true }
}

export async function actualizarAsignado(id: string, asignado: string): Promise<{ ok: true } | { error: string }> {
  const sb = createAdminClient()
  const { error } = await sb.from('crm_prospectos').update({ asignado }).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/terceros/crm')
  return { ok: true }
}

async function crearSeguimiento(nombre: string) {
  const sb = createAdminClient()
  const futuro = new Date()
  futuro.setDate(futuro.getDate() + 7)
  const fecha = diaHabilSiguiente(futuro.getFullYear(), futuro.getMonth(), futuro.getDate())

  const { data } = await sb.from('flujo_config').select('value').eq('key', 'app_todos').single()
  const todos: Record<string, { id: string; text: string; done: boolean; prioridad?: string }[]> = data?.value ? JSON.parse(data.value) : {}

  const items = todos[fecha] ?? []
  items.push({
    id: Date.now().toString(),
    text: `Seguimiento prospecto: ${nombre}`,
    done: false,
    prioridad: 'negrita',
  })
  todos[fecha] = items

  await sb.from('flujo_config').upsert({
    key: 'app_todos',
    value: JSON.stringify(todos),
    updated_at: new Date().toISOString(),
  })
}

export async function moverProspecto(id: string, nuevoEstado: 'prospecto' | 'propuesta' | 'ganado' | 'perdido'): Promise<{ ok: true } | { error: string }> {
  const sb = createAdminClient()

  const { data: prospecto } = await sb.from('crm_prospectos').select('*').eq('id', id).single()
  if (!prospecto) return { error: 'Prospecto no encontrado' }

  const update: Record<string, unknown> = { estado: nuevoEstado }
  const now = new Date().toISOString()

  if (nuevoEstado === 'propuesta') update.propuesta_at = now
  if (nuevoEstado === 'ganado') update.ganado_at = now
  if (nuevoEstado === 'perdido') update.perdido_at = now

  const { error } = await sb.from('crm_prospectos').update(update).eq('id', id)
  if (error) return { error: error.message }

  if (nuevoEstado === 'propuesta') {
    await crearSeguimiento(prospecto.nombre)
  }

  revalidatePath('/terceros/crm')
  return { ok: true }
}

export async function regenerarSeguimiento(nombreProspecto: string): Promise<{ ok: true } | { error: string }> {
  const sb = createAdminClient()
  const { data } = await sb.from('crm_prospectos').select('estado').ilike('nombre', nombreProspecto).single()
  if (!data || data.estado !== 'propuesta') return { ok: true }
  await crearSeguimiento(nombreProspecto)
  return { ok: true }
}

export async function fetchTercerosAltas(): Promise<TerceroAlta[]> {
  const pool = getPool()
  if (!pool) return []

  const excl = [...CLIENT_IDS_PROPIOS, '1'].map(id => `'${id}'`).join(', ')

  try {
    const client = await pool.connect()
    try {
      const res = await client.query<{
        client_id: string
        merchant_name: string | null
        tiendas: string
        ventas_cantidad: string
        ventas_monto: string
        ventas_ayer_cantidad: string
        ventas_ayer_monto: string
      }>(`
        WITH nombres AS (
          SELECT DISTINCT ON (client_id) client_id, merchant_name
          FROM gocuotas_stores
          WHERE client_id NOT IN (${excl})
            AND merchant_name IS NOT NULL
          ORDER BY client_id, updated_at DESC
        ),
        tiendas AS (
          SELECT client_id,
            COUNT(DISTINCT store_name) AS tiendas
          FROM gocuotas_orders
          WHERE client_id NOT IN (${excl})
          GROUP BY client_id
        ),
        ventas30 AS (
          SELECT client_id,
            COUNT(*)::text AS ventas_cantidad,
            COALESCE(SUM(total_order_amount), 0)::text AS ventas_monto
          FROM gocuotas_orders
          WHERE client_id NOT IN (${excl})
            AND order_created_at >= now() - interval '30 days'
            AND order_discarded_at IS NULL
          GROUP BY client_id
        ),
        ventas_ayer AS (
          SELECT client_id,
            COUNT(*)::text AS ventas_ayer_cantidad,
            COALESCE(SUM(total_order_amount), 0)::text AS ventas_ayer_monto
          FROM gocuotas_orders
          WHERE client_id NOT IN (${excl})
            AND order_created_at >= (current_date - interval '1 day')
            AND order_created_at < current_date
            AND order_discarded_at IS NULL
          GROUP BY client_id
        )
        SELECT t.client_id, n.merchant_name, t.tiendas::text,
          COALESCE(v.ventas_cantidad, '0') AS ventas_cantidad,
          COALESCE(v.ventas_monto, '0') AS ventas_monto,
          COALESCE(a.ventas_ayer_cantidad, '0') AS ventas_ayer_cantidad,
          COALESCE(a.ventas_ayer_monto, '0') AS ventas_ayer_monto
        FROM tiendas t
        LEFT JOIN nombres n ON n.client_id = t.client_id
        LEFT JOIN ventas30 v ON v.client_id = t.client_id
        LEFT JOIN ventas_ayer a ON a.client_id = t.client_id
        ORDER BY t.client_id
      `)

      return res.rows.map(r => ({
        clientId: r.client_id,
        merchantName: r.merchant_name ?? `Cliente ${r.client_id}`,
        tiendas: Number(r.tiendas),
        ventasCantidad: Number(r.ventas_cantidad),
        ventasMonto: Number(r.ventas_monto),
        ventasAyerCantidad: Number(r.ventas_ayer_cantidad),
        ventasAyerMonto: Number(r.ventas_ayer_monto),
      }))
    } finally {
      client.release()
    }
  } catch (e) {
    console.error('Error fetching terceros altas:', e)
    return []
  }
}

export async function fetchTercerosVentasDiarias(): Promise<VentaDiariaTercero[]> {
  const pool = getPool()
  if (!pool) return []

  const excl = [...CLIENT_IDS_PROPIOS, '1'].map(id => `'${id}'`).join(', ')

  try {
    const client = await pool.connect()
    try {
      const res = await client.query<{
        client_id: string
        merchant_name: string | null
        fecha: string
        cantidad: string
        monto: string
      }>(`
        WITH nombres AS (
          SELECT DISTINCT ON (client_id) client_id, merchant_name
          FROM gocuotas_stores
          WHERE client_id NOT IN (${excl})
            AND merchant_name IS NOT NULL
          ORDER BY client_id, updated_at DESC
        )
        SELECT o.client_id, n.merchant_name,
          o.order_created_at::date::text AS fecha,
          COUNT(*)::text AS cantidad,
          COALESCE(SUM(o.total_order_amount), 0)::text AS monto
        FROM gocuotas_orders o
        LEFT JOIN nombres n ON n.client_id = o.client_id
        WHERE o.client_id NOT IN (${excl})
          AND o.order_discarded_at IS NULL
          AND o.order_created_at >= now() - interval '90 days'
        GROUP BY o.client_id, n.merchant_name, o.order_created_at::date
        ORDER BY fecha
      `)

      return res.rows.map(r => ({
        clientId: r.client_id,
        merchantName: r.merchant_name ?? `Cliente ${r.client_id}`,
        fecha: r.fecha,
        cantidad: Number(r.cantidad),
        monto: Number(r.monto),
      }))
    } finally {
      client.release()
    }
  } catch (e) {
    console.error('Error fetching terceros ventas diarias:', e)
    return []
  }
}
