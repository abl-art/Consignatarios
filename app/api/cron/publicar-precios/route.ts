import { NextResponse } from 'next/server'
import { publicarBonosIniciados, reajustarPreciosBonos } from '@/lib/actions/publicar-precios'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Corre cada 10 min (pg_cron 'reajuste-precios-bonos'; respaldo diario en
// vercel.json). Dos pasadas sobre la tienda:
//   1. Reajuste: repone el precio pleno cuando un bono venció (corrida de las
//      00:00 ART del día siguiente) o agotó su cupo.
//   2. Inicio: publica el precio CON bono cuando una campaña arranca (corrida
//      de las 00:05 ART del día `desde`), o si la publicación al guardar falló.
// Casi todas las corridas terminan sin nada que hacer.
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

  const reajuste = await reajustarPreciosBonos({ dry, fecha })
  const inicios = await publicarBonosIniciados({ dry, fecha })
  return NextResponse.json({ reajuste, inicios }, { status: reajuste.error || inicios.error ? 500 : 200 })
}
