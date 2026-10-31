import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { consultarImeiEnacom } from '@/lib/enacom'

export const dynamic = 'force-dynamic'
export const maxDuration = 30
// ENACOM dropea las conexiones desde AWS São Paulo (gru1, la región default
// del proyecto): UND_ERR_CONNECT_TIMEOUT medido el 31/10/2026. Desde
// datacenters de EE.UU. el sitio responde — esta route corre en iad1 solo
// para poder hacer la consulta.
export const preferredRegion = 'iad1'

/**
 * Estado del IMEI en ENACOM para la pestaña Siniestros (EnacomCell). Requiere
 * sesión (patrón API routes del repo — /api está fuera del middleware): sin
 * login no hay proxy de consultas a ENACOM.
 */
export async function GET(request: NextRequest) {
  const supabaseAuth = createClient()
  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const imei = request.nextUrl.searchParams.get('imei') ?? ''
  if (!/^\d{14,16}$/.test(imei)) {
    return NextResponse.json({ error: 'IMEI inválido' }, { status: 400 })
  }

  return NextResponse.json(await consultarImeiEnacom(imei))
}
