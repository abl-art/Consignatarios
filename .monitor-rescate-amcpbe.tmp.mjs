// Monitor SO-AMCPBE (pedido de Emiliano 29/10): esperar a que el pedido pase
// a expedido/rescatable y disparar el rescate — espejo de aplicarRescateAndreani:
// apply cancelar_pedido (rescate automático de Pedro), marca rescate_wh_at +
// estado confirmada en arrepentimientos, inserta en rescates_seguimiento.
// Idempotente: si el botón de la UI gana la carrera (rescate_wh_at ya seteado
// o estado no pendiente), se retira sin tocar nada.
import fs from 'node:fs'
import crypto from 'node:crypto'
import { Client } from 'pg'

const ORDER = 'SO-AMCPBE'
const TRACKING = '360003145287600'
const CADA_MS = 10 * 60 * 1000
const MAX_ITER = 220 // ~36 horas

const san = v => v.trim().replace(/^"|"$/g, '').replace(/\\n/g, '').replace(/\n/g, '').trim()
const env = {}
for (const line of fs.readFileSync('/home/cremi/consignacion-app/.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) env[m[1]] = san(m[2])
}
const BASE = 'https://gocelular.gocuotas.com/api/webhooks/gocelular/cancelaciones'
const MOTIVO = 'Arrepentimiento del cliente — solicitado desde GOcelular360'

function firmado(raw) {
  const ts = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 19) + '-03:00'
  return { ts, sig: crypto.createHmac('sha256', env.GOCELULAR_WEBHOOK_SECRET).update(`${ts}.${raw}`).digest('hex') }
}
async function get() {
  const { ts, sig } = firmado('')
  const r = await fetch(`${BASE}?order_number=${ORDER}`, { headers: { 'X-Gocelular-Signature': sig, 'X-Gocelular-Timestamp': ts }, signal: AbortSignal.timeout(10000) })
  return { status: r.status, body: await r.json().catch(() => null) }
}
async function post(mode) {
  const body = JSON.stringify({ mode, accion: 'cancelar_pedido', order_number: ORDER, motivo: MOTIVO, source: '360' })
  const { ts, sig } = firmado(body)
  const r = await fetch(BASE, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Gocelular-Signature': sig, 'X-Gocelular-Timestamp': ts }, body, signal: AbortSignal.timeout(15000) })
  return { status: r.status, body: await r.json().catch(() => null) }
}
const log = m => console.log(`[${new Date().toISOString()}] ${m}`)

for (let i = 0; i < MAX_ITER; i++) {
  try {
    // ¿La UI ya lo resolvió? (carrera con el botón de Yami)
    const db = new Client({ connectionString: env.SUPABASE_DB_URL })
    await db.connect()
    const { rows: [fila] } = await db.query(
      `SELECT id, estado, rescate_wh_at FROM arrepentimientos WHERE order_number = $1`, [ORDER])
    if (!fila || fila.estado !== 'pendiente' || fila.rescate_wh_at) {
      log(`RETIRADA: la fila ya no está pendiente (estado=${fila?.estado}, rescate_wh_at=${fila?.rescate_wh_at}) — lo resolvió la UI`)
      await db.end()
      process.exit(0)
    }

    const prev = await post('preview')
    const resultado = prev.body?.resultado ?? 'sin_respuesta'
    log(`preview → ${prev.status} ${resultado}`)

    let rescatable = resultado === 'no_cancelable_expedido'
    if (resultado.startsWith('rescate')) {
      const est = await get()
      rescatable = est.status === 200 && est.body?.rescate == null // proyección = GO
      if (!rescatable) { log('rescate ya vigente del lado de Pedro — nada que disparar'); await db.end(); process.exit(0) }
    }

    if (rescatable) {
      log('EXPEDIDO/RESCATABLE → apply')
      const ap = await post('apply')
      const resAp = ap.body?.resultado ?? 'sin_respuesta'
      log(`apply → ${ap.status} ${JSON.stringify(ap.body)?.slice(0, 300)}`)
      if (ap.status === 200 && resAp.startsWith('rescate')) {
        const detalle = JSON.stringify(ap.body).slice(0, 400)
        await db.query(
          `UPDATE arrepentimientos SET rescate_wh_at = now(), rescate_wh_detalle = $1, estado = 'confirmada', resuelto_at = now() WHERE id = $2`,
          [detalle, fila.id])
        await db.query(
          `INSERT INTO rescates_seguimiento (tracking, motivo, updated_at) VALUES ($1, 'Arrepentimiento', now())
           ON CONFLICT (tracking) DO UPDATE SET motivo = 'Arrepentimiento', updated_at = now()`, [TRACKING])
        log(`✅ RESCATE PEDIDO (request_id ${ap.body?.request_id}) — arrepentimiento cerrado, fila en Rescates`)
        await db.end()
        process.exit(0)
      }
      log(`apply no pidió rescate (${resAp}) — sigo esperando`)
    }
    await db.end()
  } catch (e) {
    log(`error de ciclo (sigo): ${e.message}`)
  }
  await new Promise(r => setTimeout(r, CADA_MS))
}
log('TIMEOUT ~36h sin pasar a expedido — revisar a mano')
process.exit(1)
