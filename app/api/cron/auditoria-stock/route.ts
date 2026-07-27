import { NextResponse } from 'next/server'
import { generarPlanilla } from '@/lib/actions/auditoria-stock'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Generar planilla del mes anterior
  const hoy = new Date()
  hoy.setMonth(hoy.getMonth() - 1)
  const mesAnterior = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`

  const result = await generarPlanilla(mesAnterior)

  if ('error' in result) {
    return NextResponse.json({ mes: mesAnterior, error: result.error }, { status: 200 })
  }

  return NextResponse.json({ mes: mesAnterior, ok: true, id: result.id })
}
