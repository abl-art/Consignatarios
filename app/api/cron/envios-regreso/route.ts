import { NextResponse } from 'next/server'
import { sincronizarEnviosRegreso } from '@/lib/actions/envios-regreso'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

// Corre una vez por día (vercel.json): consulta la API pública de Andreani con
// presupuesto fijo y alimenta la pestaña "Pendiente de regreso" de /compras/envios.
// ?max=N sube el tope por corrida (se usó para drenar el backlog inicial de 60 días).
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const max = Math.min(Number(url.searchParams.get('max')) || 80, 250)
  // ?dias= agranda la ventana para barridos puntuales (el diario queda en 60)
  const dias = Math.min(Number(url.searchParams.get('dias')) || 60, 365)
  const resumen = await sincronizarEnviosRegreso(max, dias)
  return NextResponse.json({ ok: true, ...resumen })
}
