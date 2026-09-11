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
  const { data, error } = await supabase
    .from('novedades_gocelular')
    .insert(parsed.novedades.map(n => ({ ...n })))
    .select('id')
  if (error) {
    console.error('novedades webhook: insert falló —', error.message)
    return NextResponse.json({ error: 'db_error', retryable: true }, { status: 500 })
  }

  return NextResponse.json({ result: 'ok', ids: (data ?? []).map(d => d.id) })
}
