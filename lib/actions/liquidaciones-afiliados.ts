'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPool } from '@/lib/db-pool'
import { revalidatePath } from 'next/cache'
import type { LiquidacionAfiliado } from '@/lib/types'

const PARTNERS_EXCLUIDOS = ['smoke']

/**
 * Genera liquidaciones de afiliados para un mes dado (YYYY-MM).
 * Consulta store_orders de GOcelular DB agrupadas por partner.
 * Llamada desde el cron — usa admin client (no depende de session).
 */
export async function generarLiquidacionesAfiliados(mes: string) {
  const pool = getPool()
  if (!pool) return { error: 'GOcelular DB no configurada' }

  const sb = createAdminClient()

  const [year, month] = mes.split('-').map(Number)
  const fechaInicio = `${mes}-01`
  const fechaFin = new Date(year, month, 0).toISOString().slice(0, 10)

  // Verificar si ya existen
  const { count } = await sb
    .from('liquidaciones_afiliados')
    .select('*', { count: 'exact', head: true })
    .eq('mes', mes)
  if (count && count > 0) {
    return { ok: true, message: `Liquidaciones afiliados de ${mes} ya existen (${count})`, creadas: 0 }
  }

  // Query GOcelular DB for paid orders with commission
  const client = await pool.connect()
  try {
    const result = await client.query<{
      partner_slug: string
      partner_name: string
      total_comisiones: number
    }>(
      `SELECT
        ap.slug AS partner_slug,
        ap.display_name AS partner_name,
        CASE
          WHEN ap.commission_type = 'percent'
            THEN SUM((so.product_price / 100) / 1.21 * ap.commission_value / 100)
          ELSE 0
        END::numeric AS total_comisiones
      FROM store_orders so
      JOIN affiliate_partners ap ON ap.id = so.attributed_partner_id
      WHERE so.status = 'paid'
        AND so.created_at >= $1::date
        AND so.created_at < ($2::date + 1)
        AND ap.slug != ALL($3)
      GROUP BY ap.slug, ap.display_name, ap.commission_type, ap.commission_value
      HAVING CASE
        WHEN ap.commission_type = 'percent'
          THEN SUM((so.product_price / 100) / 1.21 * ap.commission_value / 100)
        ELSE 0
      END > 0`,
      [fechaInicio, fechaFin, PARTNERS_EXCLUIDOS]
    )

    let creadas = 0
    for (const row of result.rows) {
      const comisiones = Number(row.total_comisiones)
      const { error } = await sb.from('liquidaciones_afiliados').insert({
        partner_slug: row.partner_slug,
        partner_name: row.partner_name,
        mes,
        total_comisiones: comisiones,
        monto_a_pagar: comisiones,
        estado: 'pendiente',
      })
      if (!error) creadas++
    }

    return { ok: true, mes, creadas }
  } finally {
    client.release()
  }
}

/**
 * Marcar una liquidacion de afiliado como pagada.
 * Requiere que tenga factura_url.
 */
export async function marcarPagadaAfiliado(id: string) {
  const supabase = createClient()

  const { data: liq } = await supabase
    .from('liquidaciones_afiliados')
    .select('factura_url')
    .eq('id', id)
    .single()

  if (!liq?.factura_url) {
    return { error: 'No se puede marcar como pagada sin factura adjunta' }
  }

  const { error } = await supabase
    .from('liquidaciones_afiliados')
    .update({
      estado: 'pagada',
      fecha_pago: new Date().toISOString().split('T')[0],
    })
    .eq('id', id)
    .eq('estado', 'pendiente')

  if (error) return { error: error.message }

  revalidatePath('/canales/afiliados/liquidaciones')
  return { ok: true }
}

/**
 * Subir factura PDF para una liquidacion de afiliado.
 * Accesible desde la pagina publica (no requiere auth).
 */
export async function subirFacturaAfiliado(liquidacionId: string, formData: FormData) {
  const supabase = createAdminClient()
  const file = formData.get('file') as File
  if (!file || !file.name.toLowerCase().endsWith('.pdf')) {
    return { error: 'Solo se aceptan archivos PDF' }
  }

  const { data: liq } = await supabase
    .from('liquidaciones_afiliados')
    .select('mes, partner_slug, estado')
    .eq('id', liquidacionId)
    .single()

  if (!liq) return { error: 'Liquidacion no encontrada' }
  if (liq.estado !== 'pendiente') return { error: 'Solo se puede subir factura en estado pendiente' }

  const fileName = `afiliado_${liq.partner_slug}_${liq.mes}.pdf`

  const { error: uploadErr } = await supabase.storage
    .from('facturas')
    .upload(fileName, file, { upsert: true, contentType: 'application/pdf' })
  if (uploadErr) return { error: uploadErr.message }

  const { data: urlData } = supabase.storage.from('facturas').getPublicUrl(fileName)

  const { error: updateErr } = await supabase
    .from('liquidaciones_afiliados')
    .update({ factura_url: urlData.publicUrl })
    .eq('id', liquidacionId)

  if (updateErr) return { error: updateErr.message }

  revalidatePath('/canales/afiliados/liquidaciones')
  return { ok: true }
}

/**
 * Obtener liquidaciones de un afiliado por slug (pagina publica).
 */
export async function obtenerLiquidacionesAfiliado(slug: string) {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('liquidaciones_afiliados')
    .select('*')
    .eq('partner_slug', slug)
    .order('mes', { ascending: false })
    .returns<LiquidacionAfiliado[]>()

  if (error) return { error: error.message }
  return { data: data ?? [] }
}

/**
 * Obtener todos los afiliados desde GOcelular DB (para página de links).
 */
export async function obtenerTodosLosAfiliados(): Promise<{ slug: string; display_name: string }[]> {
  const pool = getPool()
  if (!pool) return []

  const client = await pool.connect()
  try {
    const result = await client.query<{ slug: string; display_name: string }>(
      `SELECT slug, display_name FROM affiliate_partners
       WHERE slug != ALL($1)
       ORDER BY display_name`,
      [PARTNERS_EXCLUIDOS]
    )
    return result.rows
  } finally {
    client.release()
  }
}

/**
 * Obtener nombre del afiliado desde GOcelular DB.
 */
export async function obtenerNombreAfiliado(slug: string): Promise<string | null> {
  const pool = getPool()
  if (!pool) return null

  const client = await pool.connect()
  try {
    const result = await client.query<{ display_name: string }>(
      'SELECT display_name FROM affiliate_partners WHERE slug = $1',
      [slug]
    )
    return result.rows[0]?.display_name ?? null
  } finally {
    client.release()
  }
}
