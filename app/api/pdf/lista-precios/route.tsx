import { renderToBuffer } from '@react-pdf/renderer'
import { NextResponse } from 'next/server'
import { getMupConfig, getProductosCelularesConPrecio } from '@/lib/actions/lista-precios'
import { ListaPreciosPDF } from '@/lib/pdf/lista-precios'

export async function GET() {
  const [mup, productos] = await Promise.all([
    getMupConfig(),
    getProductosCelularesConPrecio(),
  ])

  // Filter only visible products and calculate prices
  const productosVisibles = productos
    .filter(p => !p.oculto_lista_precios)
    .map(p => {
      const precio_venta_neto = Math.round(p.mejor_precio * (1 + mup / 100))
      const iva = Math.round(precio_venta_neto * 0.21)
      return {
        nombre: p.nombre,
        precio_venta_neto,
        iva,
        precio_con_iva: precio_venta_neto + iva,
      }
    })

  const fecha = new Date().toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })

  const element = ListaPreciosPDF({ productos: productosVisibles, fecha })
  const buffer = await renderToBuffer(element)

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="lista-precios-${new Date().toISOString().slice(0, 10)}.pdf"`,
    },
  })
}
