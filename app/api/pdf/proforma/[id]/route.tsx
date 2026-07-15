import { renderToBuffer } from '@react-pdf/renderer'
import { NextResponse } from 'next/server'
import { getProformaConItems } from '@/lib/actions/proformas'
import { createAdminClient } from '@/lib/supabase/admin'
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

  // Fetch client data if linked
  let clienteNombre = proforma.cliente_nombre || ''
  let clienteCuit = ''
  let clienteIva = ''
  let clienteDireccion = ''

  if (proforma.cliente_mayorista_id) {
    const admin = createAdminClient()
    const { data: cliente } = await admin
      .from('clientes_mayoristas')
      .select('nombre_comercial, razon_social, cuit, condicion_iva, direccion_entrega')
      .eq('id', proforma.cliente_mayorista_id)
      .single()

    if (cliente) {
      clienteNombre = cliente.razon_social || cliente.nombre_comercial
      clienteCuit = cliente.cuit || ''
      clienteIva = cliente.condicion_iva || ''
      clienteDireccion = cliente.direccion_entrega || ''
    }
  }

  const fecha = new Date(proforma.fecha).toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })

  const element = ProformaPDF({
    nombre: proforma.nombre,
    clienteNombre,
    clienteCuit,
    clienteIva,
    clienteDireccion,
    fecha,
    items: proforma.proforma_items,
    total_neto: proforma.total_neto,
    total_iva: proforma.total_iva,
    total_con_iva: proforma.total_con_iva,
    notas: proforma.notas,
  })

  const buffer = await renderToBuffer(element)

  const safeName = clienteNombre.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase() || 'proforma'
  const filename = `proforma-${safeName}-${new Date(proforma.fecha).toISOString().slice(0, 10)}.pdf`

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${filename}"`,
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  })
}
