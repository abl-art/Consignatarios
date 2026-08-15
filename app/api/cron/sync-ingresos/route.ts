import { NextResponse } from 'next/server'
import { sincronizarIngresosGocelular } from '@/lib/actions/sync-ingresos'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Corre cada 30 min (vercel.json) para que los ingresos de Andreani se reflejen
// aunque nadie cargue /compras/gestor, que es el otro punto donde corre este sync.
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  await sincronizarIngresosGocelular()
  return NextResponse.json({ ok: true })
}
