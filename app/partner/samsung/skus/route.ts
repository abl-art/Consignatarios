import { NextRequest, NextResponse } from 'next/server'
import { getSkusSamsungRango, PARTNER_SAMSUNG_TOKEN } from '@/lib/actions/partner-samsung'

export const dynamic = 'force-dynamic'

// SKUs Samsung vendidos (tienda propia) en un rango ART — filtro
// "personalizado" de la tarjeta del link partner. Público bajo /partner/
// (middleware), mismo token que la página.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  if (searchParams.get('token') !== PARTNER_SAMSUNG_TOKEN) {
    return NextResponse.json({ error: 'no autorizado' }, { status: 401 })
  }
  const desde = searchParams.get('desde') ?? ''
  const hasta = searchParams.get('hasta') ?? ''
  const skus = await getSkusSamsungRango(desde, hasta)
  if (!skus) return NextResponse.json({ error: 'rango inválido' }, { status: 400 })
  return NextResponse.json({ skus })
}
