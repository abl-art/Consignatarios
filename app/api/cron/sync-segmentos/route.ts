import { NextResponse } from 'next/server'
import { sincronizarSegmentos } from '@/lib/segmentos'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(request: Request) {
  // Verificar que viene de Vercel Cron (header Authorization)
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const resultado = await sincronizarSegmentos()
    return NextResponse.json({ ok: true, ...resultado })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Error sincronizando segmentos' },
      { status: 500 }
    )
  }
}
