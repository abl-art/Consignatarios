import { readFile } from 'fs/promises'
import path from 'path'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

// PNL Mensual de GOcuotas (docs/pnl-mensual-gocuotas/pnl-mensual.html, datos
// embebidos en window.__PNL__/__CONTENIDO__). Se sirve detrás del login:
// son resultados financieros del grupo, no pueden ir en /public. Los filtros
// (?mes=&soc=&modelo=&aj_*) los lee el propio HTML de location.search.
// Para actualizarlo: reemplazar el archivo en docs/ con el export nuevo.
export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', process.env.NEXT_PUBLIC_SITE_URL ?? 'https://gocelular360.vercel.app'))

  const html = await readFile(
    path.join(process.cwd(), 'docs', 'pnl-mensual-gocuotas', 'pnl-mensual.html'),
    'utf8'
  )
  return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}
