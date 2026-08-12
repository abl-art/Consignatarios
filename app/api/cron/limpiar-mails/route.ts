import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getGoogleAccessToken } from '@/lib/google'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const GMAIL = 'https://gmail.googleapis.com/gmail/v1/users/me'
const REGLAS_KEY = 'mails_reglas_limpieza'
const LOG_KEY = 'mails_autolimpieza_log'

// Reglas por defecto: patrones que el usuario borra sin leer todos los dias
// (detectados analizando la papelera). Todo va a papelera de Gmail
// (recuperable 30 dias), nunca borrado permanente.
const REGLAS_DEFAULT: { nombre: string; query: string }[] = [
  {
    nombre: 'Contracargos Payway',
    query: 'from:controversiascomercios@payway.com.ar',
  },
  {
    nombre: 'Anulaciones de venta GOcuotas',
    query: 'from:noreply@gocuotas.com "se anulo una venta"',
  },
  {
    nombre: 'Digests de Basecamp',
    query: 'from:app.basecamp.com {subject:"latest activity" subject:"here are your tasks"}',
  },
  {
    nombre: 'Newsletters de marketing',
    query:
      '{from:comunicaciones@ecommerce.institute from:calipso@calipso.com from:no-reply@mail.nordvpn.com from:info@endeavor.org.ar from:marriottbonvoy@email-marriott.com from:samsunglatam@ar.email.samsung.com from:info@comunicaciones.zonajobs.com.ar from:info@mail.eddingshop.ar from:groups-noreply@linkedin.com from:contacto@bayton.com.ar from:calidad@encuestas.personal.com.ar from:hello@lindy.ai}',
  },
]

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const token = await getGoogleAccessToken()
  if (!token) return NextResponse.json({ error: 'Google no conectado' }, { status: 500 })

  const sb = createAdminClient()

  // Reglas editables en flujo_config; si no existen se siembran las default
  let reglas = REGLAS_DEFAULT
  const { data: reglasRow } = await sb.from('flujo_config').select('value').eq('key', REGLAS_KEY).single()
  if (reglasRow?.value) {
    try {
      reglas = JSON.parse(reglasRow.value)
    } catch {
      // usar default
    }
  } else {
    await sb.from('flujo_config').upsert({
      key: REGLAS_KEY,
      value: JSON.stringify(REGLAS_DEFAULT),
      updated_at: new Date().toISOString(),
    })
  }

  const gm = (path: string, init?: RequestInit) =>
    fetch(`${GMAIL}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    })

  const resultados: { regla: string; borrados: number }[] = []

  for (const regla of reglas) {
    const params = new URLSearchParams({ maxResults: '100', q: `in:inbox ${regla.query}` })
    const res = await gm(`/messages?${params}`)
    if (!res.ok) {
      resultados.push({ regla: regla.nombre, borrados: -1 })
      continue
    }
    const ids: string[] = (((await res.json()).messages ?? []) as { id: string }[]).map(m => m.id)
    if (ids.length > 0) {
      // A papelera (TRASH): recuperable 30 dias
      await gm(`/messages/batchModify`, {
        method: 'POST',
        body: JSON.stringify({ ids, addLabelIds: ['TRASH'], removeLabelIds: ['INBOX', 'UNREAD'] }),
      })
    }
    resultados.push({ regla: regla.nombre, borrados: ids.length })
  }

  // Registro auditable de las ultimas 60 corridas
  const { data: logRow } = await sb.from('flujo_config').select('value').eq('key', LOG_KEY).single()
  let log: { fecha: string; resultados: { regla: string; borrados: number }[] }[] = []
  try {
    log = logRow?.value ? JSON.parse(logRow.value) : []
  } catch {
    log = []
  }
  log.unshift({ fecha: new Date().toISOString(), resultados })
  await sb.from('flujo_config').upsert({
    key: LOG_KEY,
    value: JSON.stringify(log.slice(0, 60)),
    updated_at: new Date().toISOString(),
  })

  return NextResponse.json({ ok: true, resultados })
}
