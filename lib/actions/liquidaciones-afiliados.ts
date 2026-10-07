'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPool } from '@/lib/db-pool'
import { revalidatePath } from 'next/cache'
import type { LiquidacionAfiliado, LiquidacionAfiliadoAjuste } from '@/lib/types'
import {
  calcularLiquidacion,
  detectarAjustes,
  saldoArrastre,
  type OrdenAnulada,
} from '@/lib/liquidaciones-afiliados-calc'

const PARTNERS_EXCLUIDOS = ['smoke']

/**
 * Genera liquidaciones de afiliados para un mes dado (YYYY-MM).
 * Consulta store_orders de GOcelular DB agrupadas por partner, y descuenta
 * como ajuste las órdenes de meses ya liquidados que se anularon después
 * de generada su liquidación (arrepentimientos post-pago). Si el monto
 * queda <= 0 la liquidación nace 'compensada' y el saldo negativo se
 * arrastra al mes siguiente.
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

  // Liquidaciones previas: para saber qué órdenes anuladas ya habían sido
  // liquidadas (ajustes) y qué saldo negativo arrastra cada partner.
  const { data: previas, error: previasErr } = await sb
    .from('liquidaciones_afiliados')
    .select('partner_slug, partner_name, mes, created_at, monto_a_pagar')
  if (previasErr) return { error: previasErr.message }

  // Órdenes ya descontadas en liquidaciones anteriores (no repetir)
  const { data: aplicadasRows, error: aplicadasErr } = await sb
    .from('liquidaciones_afiliados_ajustes')
    .select('order_id')
  if (aplicadasErr) return { error: aplicadasErr.message }
  const yaAplicadas = new Set((aplicadasRows ?? []).map(r => r.order_id as string))

  const client = await pool.connect()
  try {
    // Comisiones del mes (órdenes pagas)
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
        -- Al anularse una orden el status queda 'paid' y solo se setea
        -- cancelled_at: sin este filtro se pagaría comisión por anuladas
        AND so.cancelled_at IS NULL
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

    // Candidatas a ajuste: órdenes de meses ANTERIORES al liquidado, pagas en
    // algún momento y hoy anuladas. detectarAjustes filtra las que realmente
    // entraron en una liquidación generada (pagas antes, anuladas después).
    const anuladasRes = await client.query<{
      orderId: string
      orderNumber: string | null
      partnerSlug: string
      partnerName: string
      producto: string | null
      comision: number
      mes: string
      paidAt: Date
      cancelledAt: Date
    }>(
      `SELECT so.id::text AS "orderId",
              so.order_number AS "orderNumber",
              ap.slug AS "partnerSlug",
              ap.display_name AS "partnerName",
              so.product_name AS producto,
              ((so.product_price / 100) / 1.21 * ap.commission_value / 100)::numeric AS comision,
              to_char(so.created_at, 'YYYY-MM') AS mes,
              so.paid_at AS "paidAt",
              so.cancelled_at AS "cancelledAt"
       FROM store_orders so
       JOIN affiliate_partners ap ON ap.id = so.attributed_partner_id
       WHERE so.cancelled_at IS NOT NULL
         AND so.paid_at IS NOT NULL
         AND ap.commission_type = 'percent'
         AND so.created_at < $1::date
         AND ap.slug != ALL($2)`,
      [fechaInicio, PARTNERS_EXCLUIDOS]
    )

    const candidatas: OrdenAnulada[] = anuladasRes.rows.map(r => ({
      orderId: r.orderId,
      orderNumber: r.orderNumber,
      partnerSlug: r.partnerSlug,
      producto: r.producto,
      comision: Number(r.comision),
      mes: r.mes,
      paidAt: r.paidAt.toISOString(),
      cancelledAt: r.cancelledAt.toISOString(),
    }))

    const ajustes = detectarAjustes(
      candidatas,
      (previas ?? []).map(l => ({ partnerSlug: l.partner_slug, mes: l.mes, createdAt: l.created_at })),
      yaAplicadas
    )

    // Saldo anterior por partner: el monto negativo de su última liquidación
    const ultimaPorPartner = new Map<string, { mes: string; monto: number }>()
    for (const l of previas ?? []) {
      const prev = ultimaPorPartner.get(l.partner_slug)
      if (!prev || l.mes > prev.mes) {
        ultimaPorPartner.set(l.partner_slug, { mes: l.mes, monto: Number(l.monto_a_pagar) })
      }
    }

    // Nombres para partners sin ventas este mes (solo ajustes o saldo)
    const nombres = new Map<string, string>()
    for (const l of previas ?? []) nombres.set(l.partner_slug, l.partner_name)
    for (const a of anuladasRes.rows) nombres.set(a.partnerSlug, a.partnerName)
    for (const r of result.rows) nombres.set(r.partner_slug, r.partner_name)

    // Partners a liquidar: con comisiones, con ajustes, o con saldo negativo
    const comisionesPorPartner = new Map(result.rows.map(r => [r.partner_slug, Number(r.total_comisiones)]))
    const partners = new Set<string>(comisionesPorPartner.keys())
    for (const a of ajustes) partners.add(a.partnerSlug)
    for (const [slug, u] of ultimaPorPartner) {
      if (saldoArrastre(u.monto) < 0) partners.add(slug)
    }

    let creadas = 0
    let ajustesAplicados = 0
    for (const slug of partners) {
      const ajustesPartner = ajustes.filter(a => a.partnerSlug === slug)
      const resumen = calcularLiquidacion({
        totalComisiones: comisionesPorPartner.get(slug) ?? 0,
        comisionesAnuladas: ajustesPartner.map(a => a.comision),
        saldoAnterior: saldoArrastre(ultimaPorPartner.get(slug)?.monto ?? 0),
      })

      const { error } = await sb.from('liquidaciones_afiliados').insert({
        partner_slug: slug,
        partner_name: nombres.get(slug) ?? slug,
        mes,
        total_comisiones: resumen.totalComisiones,
        ajustes: resumen.ajustes,
        saldo_anterior: resumen.saldoAnterior,
        monto_a_pagar: resumen.montoAPagar,
        estado: resumen.estado,
      })
      if (error) continue
      creadas++

      if (ajustesPartner.length > 0) {
        const { error: ajErr } = await sb.from('liquidaciones_afiliados_ajustes').insert(
          ajustesPartner.map(a => ({
            order_id: a.orderId,
            order_number: a.orderNumber,
            partner_slug: slug,
            mes_original: a.mes,
            mes_aplicado: mes,
            comision: a.comision,
            producto: a.producto,
            cancelled_at: a.cancelledAt,
          }))
        )
        if (!ajErr) ajustesAplicados += ajustesPartner.length
      }
    }

    return { ok: true, mes, creadas, ajustesAplicados }
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
 * Obtener los ajustes (órdenes anuladas descontadas) de un afiliado,
 * para mostrar el detalle en las liquidaciones (pagina publica y PDF).
 */
export async function obtenerAjustesAfiliado(slug: string): Promise<LiquidacionAfiliadoAjuste[]> {
  const supabase = createAdminClient()

  const { data } = await supabase
    .from('liquidaciones_afiliados_ajustes')
    .select('*')
    .eq('partner_slug', slug)
    .order('mes_aplicado', { ascending: false })
    .returns<LiquidacionAfiliadoAjuste[]>()

  return data ?? []
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
