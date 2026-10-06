import { readFile } from 'fs/promises'
import path from 'path'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

// Manual operativo de Lista de Precios (docs/manual-lista-precios/
// manual-inline.html, con las capturas embebidas como data-URI). Se sirve
// detrás del login: las capturas muestran costos y márgenes, no pueden ir
// en /public (el matcher del middleware deja pasar los .png sin sesión).
// Al cambiar la página de Lista de Precios, regenerar el manual (ver ficha
// de memoria del proyecto).
export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', process.env.NEXT_PUBLIC_SITE_URL ?? 'https://gocelular360.vercel.app'))

  const html = await readFile(
    path.join(process.cwd(), 'docs', 'manual-lista-precios', 'manual-inline.html'),
    'utf8'
  )
  return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}
