import { renderToBuffer } from '@react-pdf/renderer'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPool } from '@/lib/db-pool'
import { LiquidacionAfiliadoPDF } from '@/lib/pdf/liquidacion-afiliado'
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
        WHERE so.status = 'paid'
          AND ap.slug = $1
          AND so.created_at >= $2::date
          AND so.created_at < ($3::date + 1)
        ORDER BY so.created_at`,
        [liq.partner_slug, fechaInicio, fechaFin]
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

  const fechaEmision = new Date().toISOString().split('T')[0]

  const element = LiquidacionAfiliadoPDF({
    afiliado: liq.partner_name,
    mes: liq.mes,
    fechaEmision,
    estado: liq.estado,
    totalComisiones: liq.total_comisiones,
    montoAPagar: liq.monto_a_pagar,
    ventas,
  })

  const buffer = await renderToBuffer(element)

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="liquidacion-afiliado-${liq.partner_slug}-${liq.mes}.pdf"`,
    },
  })
}
