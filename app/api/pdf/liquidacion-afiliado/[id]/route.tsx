import { renderToBuffer } from '@react-pdf/renderer'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPool } from '@/lib/db-pool'
import { LiquidacionAfiliadoPDF } from '@/lib/pdf/liquidacion-afiliado'
import { CORTE_FILTRO_ANULADAS } from '@/lib/liquidaciones-afiliados-calc'
import type { LiquidacionAfiliado } from '@/lib/types'

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const { id } = params
  const supabase = createAdminClient()

  // Load liquidacion
  const { data: liquidacion, error: liqError } = await supabase
    .from('liquidaciones_afiliados')
    .select('*')
    .eq('id', id)
    .single()

  if (liqError || !liquidacion) {
    return NextResponse.json({ error: 'Liquidacion no encontrada' }, { status: 404 })
  }

  const liq = liquidacion as LiquidacionAfiliado

  // Parse month range
  const [year, month] = liq.mes.split('-').map(Number)
  const fechaInicio = `${liq.mes}-01`
  const fechaFin = new Date(year, month, 0).toISOString().split('T')[0]

  // Query GOcelular DB for order details
  const pool = getPool()
  let ventas: { fecha: string; producto: string; precio: number; comision: number }[] = []

  // Las liquidaciones legacy (pre-corte) incluyeron órdenes aunque ya
  // estuvieran anuladas — el PDF las muestra igual para que cuadre el total.
  const esLegacy = new Date(liq.created_at) < new Date(CORTE_FILTRO_ANULADAS)

  if (pool) {
    const client = await pool.connect()
    try {
      const result = await client.query<{
        fecha: string
        producto: string
        precio: number
        comision: number
      }>(
        `SELECT
          so.created_at::date::text AS fecha,
          so.product_name AS producto,
          (so.product_price / 100)::numeric AS precio,
          CASE
            WHEN ap.commission_type = 'percent'
              THEN ((so.product_price / 100) / 1.21 * ap.commission_value / 100)::numeric
            ELSE 0
          END AS comision
        FROM store_orders so
        JOIN affiliate_partners ap ON ap.id = so.attributed_partner_id
        WHERE ap.slug = $1
          AND so.created_at >= $2::date
          AND so.created_at < ($3::date + 1)
          -- Las ventas tal como estaban al generarse la liquidación: pagas
          -- antes y (en liquidaciones nuevas) no anuladas todavía. Una
          -- anulación posterior no borra la venta de este PDF — se descuenta
          -- como ajuste en el mes siguiente.
          AND so.status = 'paid'
          AND so.paid_at IS NOT NULL
          AND so.paid_at < $4::timestamptz
          ${esLegacy ? '' : 'AND (so.cancelled_at IS NULL OR so.cancelled_at > $4::timestamptz)'}
        ORDER BY so.created_at`,
        [liq.partner_slug, fechaInicio, fechaFin, liq.created_at]
      )

      ventas = result.rows.map((r) => ({
        fecha: r.fecha,
        producto: r.producto,
        precio: Number(r.precio),
        comision: Number(r.comision),
      }))
    } finally {
      client.release()
    }
  }

  // Ajustes descontados en esta liquidación (órdenes anuladas post-liquidación)
  const { data: ajustesRows } = await supabase
    .from('liquidaciones_afiliados_ajustes')
    .select('order_number, producto, mes_original, comision')
    .eq('partner_slug', liq.partner_slug)
    .eq('mes_aplicado', liq.mes)

  const fechaEmision = new Date().toISOString().split('T')[0]

  const element = LiquidacionAfiliadoPDF({
    afiliado: liq.partner_name,
    mes: liq.mes,
    fechaEmision,
    estado: liq.estado,
    totalComisiones: liq.total_comisiones,
    ajustes: liq.ajustes ?? 0,
    saldoAnterior: liq.saldo_anterior ?? 0,
    montoAPagar: liq.monto_a_pagar,
    ventas,
    anuladas: (ajustesRows ?? []).map((a) => ({
      orderNumber: a.order_number,
      producto: a.producto,
      mesOriginal: a.mes_original,
      comision: Number(a.comision),
    })),
  })

  const buffer = await renderToBuffer(element)

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="liquidacion-afiliado-${liq.partner_slug}-${liq.mes}.pdf"`,
    },
  })
}
