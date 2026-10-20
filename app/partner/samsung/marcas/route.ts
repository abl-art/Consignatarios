import { NextRequest, NextResponse } from 'next/server'
import { getMarcasRango, PARTNER_SAMSUNG_TOKEN, type CanalPartner } from '@/lib/actions/partner-samsung'

export const dynamic = 'force-dynamic'

const CANALES: CanalPartner[] = ['total', 'propia', 'terceros']

// Ventas por marca en un rango ART — filtro "Personalizado" de la torta del
// acuerdo del link partner. Público bajo /partner/ (middleware), mismo token
// que la página (patrón de ./skus).
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  if (searchParams.get('token') !== PARTNER_SAMSUNG_TOKEN) {
    return NextResponse.json({ error: 'no autorizado' }, { status: 401 })
  }
  const desde = searchParams.get('desde') ?? ''
  const hasta = searchParams.get('hasta') ?? ''
  const canalParam = searchParams.get('canal') ?? 'propia'
  const canal = CANALES.includes(canalParam as CanalPartner) ? (canalParam as CanalPartner) : 'propia'
  const marcas = await getMarcasRango(desde, hasta, canal)
  if (!marcas) return NextResponse.json({ error: 'rango inválido' }, { status: 400 })
  return NextResponse.json({ marcas })
}
