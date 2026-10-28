import { readFile } from 'fs/promises'
import path from 'path'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

// Manual operativo de Seguros por Robo (docs/manual-seguros/manual-inline.html,
// con las capturas embebidas como data-URI). Se sirve detrás del login: las
// capturas muestran clientes, DNIs y montos reales, no pueden ir en /public
// (el matcher del middleware deja pasar los .png sin sesión).
// Al cambiar la página de Seguros, regenerar el manual (ver ficha de memoria
// "Manuales Operativos").
export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', process.env.NEXT_PUBLIC_SITE_URL ?? 'https://gocelular360.vercel.app'))

  const html = await readFile(
    path.join(process.cwd(), 'docs', 'manual-seguros', 'manual-inline.html'),
    'utf8'
  )
  return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}
