import { renderToBuffer } from '@react-pdf/renderer'
import { NextResponse } from 'next/server'
import { getProformaConItems } from '@/lib/actions/proformas'
import { ProformaPDF } from '@/lib/pdf/proforma'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const { id } = params
  const proforma = await getProformaConItems(id)

  if (!proforma) {
    return NextResponse.json({ error: 'Proforma no encontrada' }, { status: 404 })
  }

  const fecha = new Date(proforma.fecha).toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })

  const element = ProformaPDF({
    nombre: proforma.nombre,
    fecha,
    items: proforma.proforma_items,
    total_neto: proforma.total_neto,
    total_iva: proforma.total_iva,
    total_con_iva: proforma.total_con_iva,
    notas: proforma.notas,
  })

  const buffer = await renderToBuffer(element)

  const filename = `proforma-${proforma.nombre.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}-${new Date(proforma.fecha).toISOString().slice(0, 10)}.pdf`

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${filename}"`,
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  })
}
