import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verificarFirmaNovedades, parseNovedades } from '@/lib/novedades'

export const dynamic = 'force-dynamic'

// Endpoint entrante para GOcelular (Pedro): novedades de su sistema con la
// misma auth HMAC de los webhooks salientes. Se muestran en el Dashboard 360.
export async function POST(req: Request) {
  const secret = process.env.GOCELULAR_WEBHOOK_SECRET
  if (!secret) return NextResponse.json({ error: 'secret_no_configurado' }, { status: 500 })

  const rawBody = await req.text()
  if (rawBody.length > 200_000) return NextResponse.json({ error: 'payload_too_large' }, { status: 413 })

  const firma = req.headers.get('x-gocelular-signature') ?? ''
  const ts = req.headers.get('x-gocelular-timestamp') ?? ''
  const auth = verificarFirmaNovedades(secret, ts, rawBody, firma)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 })

  let body: unknown
  try {
    body = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'json_invalido' }, { status: 400 })
  }

  const parsed = parseNovedades(body)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const supabase = createAdminClient()

  // Idempotencia (contrato v2): si Pedro reintenta un 500, la novedad llega
  // con el mismo id — las que ya tenemos se saltean sin error
  const idsExternos = parsed.novedades.map(n => n.id_externo).filter((v): v is string => v !== null)
  let existentes = new Set<string>()
  if (idsExternos.length > 0) {
    const { data: ya } = await supabase.from('novedades_gocelular').select('id_externo').in('id_externo', idsExternos)
    existentes = new Set((ya ?? []).map(r => r.id_externo as string))
  }
  const nuevas = parsed.novedades.filter(n => n.id_externo === null || !existentes.has(n.id_externo))

  if (nuevas.length === 0) {
    return NextResponse.json({ result: 'ok', ids: [], duplicadas: parsed.novedades.length })
  }

  const { data, error } = await supabase
    .from('novedades_gocelular')
    .insert(nuevas.map(n => ({ ...n })))
    .select('id')
  if (error) {
    console.error('novedades webhook: insert falló —', error.message)
    return NextResponse.json({ error: 'db_error', retryable: true }, { status: 500 })
  }

  return NextResponse.json({ result: 'ok', ids: (data ?? []).map(d => d.id), duplicadas: parsed.novedades.length - nuevas.length })
}
