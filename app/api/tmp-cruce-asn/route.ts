// TEMPORAL (27/11): cruce del Excel del depósito contra las ASN, corrido en
// Vercel porque la red local de Emiliano no llega a los puertos de Postgres.
// Protegida con CRON_SECRET. Borrar cuando termine la carga.
import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db-pool'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizarScan } from '@/lib/asn-control'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  if (req.headers.get('x-cruce-secret') !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'no autorizado' }, { status: 401 })
  }
  const body = await req.json()
  const imeis: string[] = (body.imeis ?? []).map(normalizarScan).filter((v: string) => /^[0-9]{14,16}$/.test(v))
  if (imeis.length === 0) return NextResponse.json({ error: 'sin imeis' }, { status: 400 })

  const pool = getPool()
  if (!pool) return NextResponse.json({ error: 'replica no disponible' }, { status: 500 })

  const { rows: match } = await pool.query(
    `SELECT ii.imei, t.id AS asn_id, t.id_transaccion, t.created_at::date AS fecha
     FROM inventory_intake_items ii
     JOIN andreani_wh_transactions t ON t.id = ii.asn_transaction_id
     WHERE ii.imei = ANY($1) AND t.tipo='abastecimiento' AND t.superseded_at IS NULL`,
    [imeis],
  )
  const porAsn = new Map<string, { transaccion: string; fecha: string; tomados: string[] }>()
  for (const m of match) {
    const e = porAsn.get(m.asn_id) ?? { transaccion: m.id_transaccion, fecha: String(m.fecha).slice(0, 10), tomados: [] }
    e.tomados.push(normalizarScan(m.imei))
    porAsn.set(m.asn_id, e)
  }
  const { rows: tot } = await pool.query(
    `SELECT asn_transaction_id AS asn_id, count(*) AS total
     FROM inventory_intake_items WHERE asn_transaction_id = ANY($1) GROUP BY 1`,
    [[...porAsn.keys()]],
  )
  const totalPor = new Map<string, number>(tot.map(t => [t.asn_id, Number(t.total)]))

  const supabase = createAdminClient()
  const { data: ctl } = await supabase.from('asn_controles').select('asn_id, estado')
  const ctlPor = new Map((ctl ?? []).map(c => [c.asn_id, c.estado]))

  const resumen = [...porAsn.entries()].map(([asnId, e]) => ({
    asnId,
    transaccion: e.transaccion,
    fecha: e.fecha,
    esperados: totalPor.get(asnId) ?? 0,
    enExcel: e.tomados.length,
    faltan: (totalPor.get(asnId) ?? 0) - e.tomados.length,
    control: ctlPor.get(asnId) ?? null,
  })).sort((a, b) => a.fecha.localeCompare(b.fecha))

  // aplicar: registra el control (finalizado, sin mail) de las ASN pedidas
  let aplicadas: string[] = []
  if (body.aplicar === true && Array.isArray(body.asnIds)) {
    for (const asnId of body.asnIds as string[]) {
      const e = porAsn.get(asnId)
      if (!e) continue
      if (ctlPor.get(asnId) === 'finalizado') continue
      const { error } = await supabase.from('asn_controles').upsert(
        {
          asn_id: asnId,
          asn_transaccion: e.transaccion,
          estado: 'finalizado',
          leidos: e.tomados,
          sobrantes: [],
          nota: 'Carga desde Excel del deposito (Toma IMEI Recepcion)',
          finalizado_at: new Date().toISOString(),
        },
        { onConflict: 'asn_id' },
      )
      if (!error) aplicadas.push(e.transaccion)
    }
  }

  return NextResponse.json({
    imeisRecibidos: imeis.length,
    conMatch: match.length,
    sinMatch: imeis.length - new Set(match.map(m => normalizarScan(m.imei))).size,
    resumen,
    aplicadas,
  })
}
