import { renderToBuffer } from '@react-pdf/renderer'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { calcularPrecioVenta } from '@/lib/utils'
import { RemitoAsignacionPDF } from '@/lib/pdf/remito-asignacion'

type AsignacionItemRow = {
  dispositivo_id: string
  dispositivos: {
    imei: string
    modelos: { marca: string; modelo: string; precio_costo: number } | null
  } | null
}

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const { id } = params
  const supabase = createClient()

  // Load asignacion
  const { data: asignacion, error: asignacionError } = await supabase
    .from('asignaciones')
    .select('*')
    .eq('id', id)
    .single()

  if (asignacionError || !asignacion) {
    return NextResponse.json({ error: 'Asignacion no encontrada' }, { status: 404 })
  }

  // Load config (multiplicador)
  const { data: config } = await supabase
    .from('config')
    .select('*')
    .single()

  const multiplicador = config?.multiplicador ?? 1

  // Load consignatario
  const { data: consignatario } = await supabase
    .from('consignatarios')
    .select('nombre')
    .eq('id', asignacion.consignatario_id)
    .single()

  // Load asignacion items with dispositivos and modelos
  const { data: asignacionItems } = await supabase
    .from('asignacion_items')
    .select('dispositivo_id, dispositivos(imei, modelos(marca, modelo, precio_costo))')
    .eq('asignacion_id', id)

  const items = ((asignacionItems ?? []) as unknown as AsignacionItemRow[]).map((row) => {
    const dispositivo = row.dispositivos
    const modelo = dispositivo?.modelos
    const precioCosto = modelo?.precio_costo ?? 0
    return {
      imei: dispositivo?.imei ?? '',
      marca: modelo?.marca ?? '',
      modelo: modelo?.modelo ?? '',
      precioCosto,
      precioVenta: calcularPrecioVenta(precioCosto, multiplicador),
    }
  })

  const totalCosto = items.reduce((sum, i) => sum + i.precioCosto, 0)
  const totalVenta = items.reduce((sum, i) => sum + i.precioVenta, 0)

  // Resolve firma
  let firmaBase64: string | undefined
  if (asignacion.firma_url) {
    try {
      const res = await fetch(asignacion.firma_url)
      if (res.ok) {
        const buffer = await res.arrayBuffer()
        const base64 = Buffer.from(buffer).toString('base64')
        const contentType = res.headers.get('content-type') ?? 'image/png'
        firmaBase64 = `data:${contentType};base64,${base64}`
      }
    } catch {
      // firma optional, continue without it
    }
  }

  const element = RemitoAsignacionPDF({
    fecha: asignacion.fecha,
    consignatario: consignatario?.nombre ?? asignacion.consignatario_id,
    firmadoPor: asignacion.firmado_por,
    firmaBase64,
    items,
    totalCosto,
    totalVenta,
  })

  const buffer = await renderToBuffer(element)

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="remito-${id}.pdf"`,
    },
  })
}
