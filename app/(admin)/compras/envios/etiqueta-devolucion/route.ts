import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getEtiquetaDevolucion } from '@/lib/gocelular-webhook'

export const dynamic = 'force-dynamic'

// Etiqueta PDF de la devolución (contrato de Pedro 29/10): el 360 la baja
// firmada server-side (firma por orden: ts + "." + order_number) y se la
// sirve a Yami detrás del login, para mandársela al cliente (modalidad
// sucursal: la pega en el paquete).
export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', process.env.NEXT_PUBLIC_SITE_URL ?? 'https://gocelular360.vercel.app'))

  const order = req.nextUrl.searchParams.get('order')?.trim()
  if (!order || order.length > 64) {
    return NextResponse.json({ error: 'Falta ?order=SO-XXXXXX' }, { status: 400 })
  }

  const res = await getEtiquetaDevolucion(order)
  if (!res.ok) {
    const msg = res.code === 'sin_etiqueta'
      ? 'La orden no tiene devolución con etiqueta todavía.'
      : `No se pudo bajar la etiqueta (${res.code}).`
    return NextResponse.json({ error: msg }, { status: res.status || 502 })
  }
  return new NextResponse(new Uint8Array(res.pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="etiqueta-devolucion-${order}.pdf"`,
    },
  })
}
