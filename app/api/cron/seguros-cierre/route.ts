import { NextResponse } from 'next/server'
import { congelarCierre } from '@/lib/actions/seguros'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Congela el cierre mensual de Seguros por Robo (día 1 de cada mes, vercel.json
// + respaldo manual). Idempotente: si el mes ya está congelado no hace nada,
// salvo ?force=1 para recongelar (siembra manual); ?mes=YYYY-MM pisa el default
// (mes anterior al actual).
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const force = url.searchParams.get('force') === '1'
  const mes = url.searchParams.get('mes') ?? undefined

  try {
    const resultado = await congelarCierre({ mes, force })
    return NextResponse.json(resultado, { status: resultado.ok ? 200 : 500 })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Error desconocido' },
      { status: 500 },
    )
  }
}
