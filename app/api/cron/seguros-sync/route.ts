import { NextResponse } from 'next/server'
import { sincronizarSeguros } from '@/lib/actions/seguros'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Sincronización diaria de Seguros por Robo: emite certificados de ventas
// nuevas, reintenta los que quedaron 'pendiente' por falta de costo y aplica
// novedades de ciclo de vida (cambio de IMEI, anulación por descarte o
// contracargo). Con el switch de seguros_config inactivo, es un no-op.
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const resultado = await sincronizarSeguros()
  return NextResponse.json(resultado, { status: 200 })
}
