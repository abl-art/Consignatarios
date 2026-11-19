import { NextResponse } from 'next/server'
import { recolectarDatosInforme } from '@/lib/actions/informe-diario'
import { armarInformeDiario } from '@/lib/informe-diario'
import { enviarMail } from '@/lib/mailer'
import { getSupabasePool } from '@/lib/db-pool'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const KEY_ULTIMO = 'informe_diario_ultimo'
const DESTINATARIO_DEFAULT = 'emiliano.canova@gocuotas.com'

async function getUltimoEnviado(): Promise<string | null> {
  const pool = getSupabasePool()
  if (!pool) return null
  const res = await pool.query<{ value: string }>(
    `SELECT value FROM flujo_config WHERE key = $1`, [KEY_ULTIMO]
  )
  return res.rows[0]?.value ?? null
}

async function setUltimoEnviado(fecha: string): Promise<void> {
  const pool = getSupabasePool()
  if (!pool) return
  await pool.query(
    `INSERT INTO flujo_config (key, value, updated_at) VALUES ($1, $2, NOW())
     ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
    [KEY_ULTIMO, fecha]
  )
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const dry = url.searchParams.get('dry') === '1'
  const force = url.searchParams.get('force') === '1'
  const fecha = url.searchParams.get('fecha') ?? undefined

  try {
    const datos = await recolectarDatosInforme(fecha)
    const { html, texto } = armarInformeDiario(datos)

    if (dry) {
      return NextResponse.json({ ok: true, dry: true, fecha: datos.fecha, html })
    }

    // Idempotencia: el cron de Vercel puede re-ejecutar — un mail por día
    if (!force) {
      const ultimo = await getUltimoEnviado()
      if (ultimo === datos.fecha) {
        return NextResponse.json({ ok: true, skipped: true, fecha: datos.fecha })
      }
    }

    const para = process.env.INFORME_MAIL_PARA ?? DESTINATARIO_DEFAULT
    const r = await enviarMail({
      para,
      asunto: `GOcelular360 — Informe diario ${datos.fecha}`,
      texto,
      html,
    })
    if (!r.ok) {
      return NextResponse.json({ ok: false, error: r.error }, { status: 500 })
    }

    await setUltimoEnviado(datos.fecha)
    return NextResponse.json({ ok: true, fecha: datos.fecha, para })
  } catch (e) {
    console.error('informe-diario: error fatal:', e)
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    )
  }
}
