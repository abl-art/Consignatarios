import { NextResponse } from 'next/server'
import { congelarProyecciones } from '@/lib/actions/proyecciones'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Congela el run mensual de proyecciones de ventas (día 1 de cada mes por
// pg_cron + respaldo en vercel.json). Idempotente: si el run del mes ya
// existe no hace nada, salvo ?force=1 para recongelar (siembra manual).
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const force = new URL(request.url).searchParams.get('force') === '1'

  const resultado = await congelarProyecciones(force)
  return NextResponse.json(resultado, { status: resultado.ok ? 200 : 500 })
}
