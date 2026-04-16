import { renderToBuffer } from '@react-pdf/renderer'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { LiquidacionPDF } from '@/lib/pdf/liquidacion'
import type { Liquidacion } from '@/lib/types'

type VentaRow = {
  fecha_venta: string
  store_name: string | null
  precio_venta: number
  comision_monto: number
  dispositivos: {
    imei: string
    modelos: { marca: string; modelo: string } | null
  } | null
}

type DiferenciaRow = {
  monto_deuda: number
  dispositivos: {
    imei: string
    modelos: { marca: string; modelo: string } | null
  } | null
  auditorias: { consignatario_id: string; fecha: string } | null
}

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const { id } = params
  const supabase = createClient()

  // 1. Load liquidacion
  const { data: liquidacion, error: liqError } = await supabase
    .from('liquidaciones')
    .select('*')
    .eq('id', id)
    .single()

  if (liqError || !liquidacion) {
    return NextResponse.json({ error: 'Liquidacion no encontrada' }, { status: 404 })
  }

  const liq = liquidacion as Liquidacion

  // 3. Load consignatario nombre
  const { data: consignatarioRow } = await supabase
    .from('consignatarios')
    .select('nombre')
    .eq('id', liq.consignatario_id)
    .single()

  const consignatarioNombre = consignatarioRow?.nombre ?? liq.consignatario_id

  // 4. Parse mes YYYY-MM → compute inicio/fin of month
  const [year, month] = liq.mes.split('-').map(Number)
  const inicio = `${liq.mes}-01`
  const fin = new Date(year, month, 0).toISOString().split('T')[0]

  // 5. Load ventas for that consignatario + mes
  const { data: ventasData } = await supabase
    .from('ventas')
    .select('fecha_venta, store_name, precio_venta, comision_monto, dispositivos(imei, modelos(marca, modelo))')
    .eq('consignatario_id', liq.consignatario_id)
    .gte('fecha_venta', inicio)
    .lte('fecha_venta', fin)
    .order('fecha_venta')

  const ventas = (ventasData ?? []) as unknown as VentaRow[]

  // 6. Group ventas by store_name
  const sucursalMap = new Map<string, VentaRow[]>()
  for (const v of ventas) {
    const key = v.store_name ?? '(sin sucursal)'
    if (!sucursalMap.has(key)) sucursalMap.set(key, [])
    sucursalMap.get(key)!.push(v)
  }

  const ventasPorSucursal = Array.from(sucursalMap.entries()).map(([sucursal, rows]) => ({
    sucursal,
    ventas: rows.map((v) => ({
      fecha: v.fecha_venta,
      imei: v.dispositivos?.imei ?? '—',
      marca: v.dispositivos?.modelos?.marca ?? '—',
      modelo: v.dispositivos?.modelos?.modelo ?? '—',
      monto: v.precio_venta,
      comision: v.comision_monto,
    })),
  }))

  // Compute total ventas monto from loaded ventas
  const totalVentasMonto = ventas.reduce((s, v) => s + (v.precio_venta ?? 0), 0)

  // 7. Load diferencias for that consignatario in that month
  let diferenciasArr: { fecha: string; imei: string; marca: string; modelo: string; monto: number }[] = []
  if (liq.total_diferencias_descontadas > 0) {
    const { data: diferenciasData } = await supabase
      .from('diferencias')
      .select('monto_deuda, dispositivos(imei, modelos(marca, modelo)), auditorias!inner(consignatario_id, fecha)')
      .eq('auditorias.consignatario_id', liq.consignatario_id)
      .gte('auditorias.fecha', inicio)
      .lte('auditorias.fecha', fin)

    diferenciasArr = ((diferenciasData ?? []) as unknown as DiferenciaRow[]).map((d) => ({
      fecha: d.auditorias?.fecha ?? '',
      imei: d.dispositivos?.imei ?? '—',
      marca: d.dispositivos?.modelos?.marca ?? '—',
      modelo: d.dispositivos?.modelos?.modelo ?? '—',
      monto: d.monto_deuda,
    }))
  }

  // 8. Load firma from auto-auditoria of that month (if any)
  let firmaBase64: string | undefined
  const { data: autoAud } = await supabase
    .from('auditorias')
    .select('firma_url')
    .eq('consignatario_id', liq.consignatario_id)
    .eq('tipo', 'auto')
    .gte('fecha', inicio)
    .lte('fecha', fin)
    .limit(1)
    .maybeSingle()

  if (autoAud?.firma_url && autoAud.firma_url.startsWith('data:')) {
    firmaBase64 = autoAud.firma_url
  }

  // Fecha emision: today
  const fechaEmision = new Date().toISOString().split('T')[0]

  // 9. Render PDF
  const element = LiquidacionPDF({
    consignatario: consignatarioNombre,
    mes: liq.mes,
    fechaEmision,
    estado: liq.estado,
    totalComisiones: liq.total_comisiones,
    totalVentasMonto,
    diferenciasDescontadas: liq.total_diferencias_descontadas,
    montoAPagar: liq.monto_a_pagar,
    ventasPorSucursal,
    diferencias: diferenciasArr,
    firmaBase64,
  })

  const buffer = await renderToBuffer(element)

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="liquidacion-${id}.pdf"`,
    },
  })
}
