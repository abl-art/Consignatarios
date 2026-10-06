import { readFile } from 'fs/promises'
import path from 'path'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

// Manual operativo de Compras (las 6 tarjetas + proceso completo de un
// pedido: Forecast → Gestor → informe a GOcelular) — docs/manual-compras/
// manual-inline.html con capturas embebidas. Detrás del login: las capturas
// muestran precios de proveedores. Al cambiar la página Compras, el Gestor
// o el Forecast, regenerar el manual (ver ficha de memoria del proyecto).
export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', process.env.NEXT_PUBLIC_SITE_URL ?? 'https://gocelular360.vercel.app'))

  const html = await readFile(
    path.join(process.cwd(), 'docs', 'manual-compras', 'manual-inline.html'),
    'utf8'
  )
  return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}
