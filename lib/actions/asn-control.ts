'use server'

// Control de ingreso de ASN por link publico (provisorio): ver
// docs/superpowers/specs/2026-11-26-control-ingreso-asn-design.md.
// Las ASN y sus IMEIs viven en la replica de GOcelular; el control (token,
// escaneos, resultado) en Supabase (asn_controles). Novedad a GOcelular:
// SIEMPRE manual desde la vista admin (decision de Emiliano 26/11).

import { randomUUID } from 'crypto'
import { revalidatePath } from 'next/cache'
import { getPool } from '@/lib/db-pool'
import { createAdminClient } from '@/lib/supabase/admin'
import { compararLectura, normalizarScan, textoNovedadDiferencias, type ResultadoControl } from '@/lib/asn-control'
import { enviarNovedadGocelular } from '@/lib/actions/novedades'

export interface ControlAsn {
  id: number
  asn_id: string
  asn_transaccion: string
  token: string
  estado: string
  leidos: string[]
  sobrantes: string[]
  nota: string | null
  finalizado_at: string | null
  novedad_enviada_at: string | null
  created_at: string
}

export interface AsnResumen {
  asnId: string
  transaccion: string
  fecha: string
  estadoAndreani: string
  imeis: number
  addonsUnidades: number
  control: ControlAsn | null
  resultado: ResultadoControl | null
}

interface AsnReplicaRow {
  id: string
  id_transaccion: string
  estado: string
  created_at: string
  imeis: string
  addons_unidades: string | null
}

// ASNs (abastecimientos) recientes de la replica con cuantos IMEIs y unidades
// de addons las componen, cruzadas con su control en Supabase.
export async function getAsnsRecientes(dias = 60): Promise<AsnResumen[]> {
  const pool = getPool()
  if (!pool) return []
  const { rows } = await pool.query<AsnReplicaRow>(
    `SELECT t.id, t.id_transaccion, t.estado, t.created_at,
            COALESCE(d.total, 0) AS imeis,
            a.total AS addons_unidades
     FROM andreani_wh_transactions t
     LEFT JOIN LATERAL (
       SELECT count(*) AS total FROM inventory_intake_items ii WHERE ii.asn_transaction_id = t.id
     ) d ON true
     LEFT JOIN LATERAL (
       SELECT sum(ai.quantity) AS total FROM inventory_intake_addon_items ai WHERE ai.asn_transaction_id = t.id
     ) a ON true
     WHERE t.tipo = 'abastecimiento'
       AND t.superseded_at IS NULL
       AND t.created_at >= now() - make_interval(days => $1)
       -- sin IMEIs ni bultos no hay nada que controlar (versiones viejas/vacias)
       AND (COALESCE(d.total, 0) > 0 OR COALESCE(a.total, 0) > 0)
     ORDER BY t.created_at DESC`,
    [dias],
  )

  const supabase = createAdminClient()
  const { data: controles } = await supabase
    .from('asn_controles')
    .select('*')
    .in('asn_id', rows.map(r => r.id))
  const porAsn = new Map<string, ControlAsn>((controles ?? []).map(c => [c.asn_id, c as ControlAsn]))

  const resumenes: AsnResumen[] = []
  for (const r of rows) {
    const control = porAsn.get(r.id) ?? null
    let resultado: ResultadoControl | null = null
    if (control && control.estado === 'finalizado') {
      const esperados = await imeisDeAsn(r.id)
      resultado = compararLectura(esperados, control.leidos, control.sobrantes)
    }
    resumenes.push({
      asnId: r.id,
      transaccion: r.id_transaccion,
      fecha: r.created_at,
      estadoAndreani: r.estado,
      imeis: Number(r.imeis),
      addonsUnidades: Number(r.addons_unidades ?? 0),
      control,
      resultado,
    })
  }
  return resumenes
}

async function imeisDeAsn(asnId: string): Promise<string[]> {
  const pool = getPool()
  if (!pool) return []
  const { rows } = await pool.query<{ imei: string }>(
    `SELECT imei FROM inventory_intake_items WHERE asn_transaction_id = $1 ORDER BY imei`,
    [asnId],
  )
  return rows.map(r => r.imei)
}

async function addonsDeAsn(asnId: string): Promise<{ sku: string; cantidad: number }[]> {
  const pool = getPool()
  if (!pool) return []
  const { rows } = await pool.query<{ sku: string; cantidad: string }>(
    `SELECT COALESCE(sp.sku, ai.addon_product_id::text) AS sku, sum(ai.quantity) AS cantidad
     FROM inventory_intake_addon_items ai
     LEFT JOIN store_products sp ON sp.id = ai.addon_product_id
     WHERE ai.asn_transaction_id = $1
     GROUP BY 1 ORDER BY 1`,
    [asnId],
  )
  return rows.map(r => ({ sku: r.sku, cantidad: Number(r.cantidad) }))
}

/** Crea (o devuelve, si ya existe) el control con su token para el link. */
export async function crearControlAsn(asnId: string, transaccion: string): Promise<{ token?: string; error?: string }> {
  const supabase = createAdminClient()
  const { data: existente } = await supabase.from('asn_controles').select('token').eq('asn_id', asnId).maybeSingle()
  if (existente) return { token: existente.token }
  const token = randomUUID()
  const { error } = await supabase.from('asn_controles').insert({ asn_id: asnId, asn_transaccion: transaccion, token })
  if (error) return { error: error.message }
  revalidatePath('/compras/ingresos-asn')
  return { token }
}

// --- Lado publico (el operario del deposito, via token; sin login) ---

export interface ControlPublico {
  transaccion: string
  estado: string
  esperados: string[]
  addons: { sku: string; cantidad: number }[]
  /** solo si ya esta finalizado */
  resultado: ResultadoControl | null
  nota: string | null
  finalizadoAt: string | null
}

export async function getControlPorToken(token: string): Promise<ControlPublico | null> {
  if (!token || token.length < 20) return null
  const supabase = createAdminClient()
  const { data: c } = await supabase.from('asn_controles').select('*').eq('token', token).maybeSingle()
  if (!c) return null
  const esperados = await imeisDeAsn(c.asn_id)
  const addons = await addonsDeAsn(c.asn_id)
  const resultado = c.estado === 'finalizado' ? compararLectura(esperados, c.leidos ?? [], c.sobrantes ?? []) : null
  return { transaccion: c.asn_transaccion, estado: c.estado, esperados, addons, resultado, nota: c.nota, finalizadoAt: c.finalizado_at }
}

export async function finalizarControlAsn(
  token: string,
  leidos: string[],
  sobrantes: string[],
  nota: string,
): Promise<{ ok?: true; error?: string }> {
  if (!token || token.length < 20) return { error: 'Token invalido' }
  if (leidos.length > 5000 || sobrantes.length > 5000) return { error: 'Demasiados escaneos' }
  const supabase = createAdminClient()
  const { data: c } = await supabase.from('asn_controles').select('id, estado').eq('token', token).maybeSingle()
  if (!c) return { error: 'Control inexistente' }
  if (c.estado === 'finalizado') return { error: 'Este control ya fue finalizado' }
  const { error } = await supabase
    .from('asn_controles')
    .update({
      estado: 'finalizado',
      leidos: leidos.map(normalizarScan).slice(0, 5000),
      sobrantes: sobrantes.map(normalizarScan).slice(0, 5000),
      nota: nota.trim().slice(0, 500) || null,
      finalizado_at: new Date().toISOString(),
    })
    .eq('id', c.id)
  if (error) return { error: error.message }
  return { ok: true }
}

/** Aviso MANUAL de diferencias a GOcelular por el canal de Novedades v2. */
export async function avisarDiferenciasAsn(controlId: number): Promise<{ ok?: true; error?: string }> {
  const supabase = createAdminClient()
  const { data: c } = await supabase.from('asn_controles').select('*').eq('id', controlId).maybeSingle()
  if (!c) return { error: 'Control inexistente' }
  if (c.estado !== 'finalizado') return { error: 'El control todavia no fue finalizado' }
  const esperados = await imeisDeAsn(c.asn_id)
  const r = compararLectura(esperados, c.leidos ?? [], c.sobrantes ?? [])
  if (r.faltantes.length === 0 && r.sobrantes.length === 0) return { error: 'El control cerro sin diferencias — no hay nada que avisar' }
  const { titulo, detalle } = textoNovedadDiferencias(c.asn_transaccion, r, c.nota)
  const envio = await enviarNovedadGocelular({ titulo, detalle, tipo: 'aviso', referencia: `asn:${c.asn_transaccion}` })
  if (!envio.ok) return { error: envio.error ?? 'No se pudo enviar la novedad' }
  await supabase.from('asn_controles').update({ novedad_enviada_at: new Date().toISOString() }).eq('id', controlId)
  revalidatePath('/compras/ingresos-asn')
  return { ok: true }
}
