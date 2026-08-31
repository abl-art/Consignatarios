import { NextResponse } from 'next/server'
import { reajustarPreciosBonos } from '@/lib/actions/publicar-precios'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Corre cada 10 min (vercel.json). Repone el precio pleno en la tienda cuando
// un bono venció (la corrida de las 00:00 ART del día siguiente) o agotó su
// cupo (cada unidad vendida de más pierde el bono entero de MUP). Casi todas
// las corridas terminan sin nada que hacer.
//
// Query params para pruebas (siempre con el Bearer):
//   ?dry=1            → llega hasta el preview, no escribe ni marca nada
//   ?fecha=YYYY-MM-DD → simula la fecha argentina de evaluación
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const dry = url.searchParams.get('dry') === '1'
  const fecha = url.searchParams.get('fecha') ?? undefined

  const r = await reajustarPreciosBonos({ dry, fecha })
  return NextResponse.json(r, { status: r.error ? 500 : 200 })
}
