'use server'

// Control de ingreso de ASN por LINK UNICO (provisorio): el deposito de
// Andreani usa siempre el mismo link (/share/asn?token=<unico>, token en
// flujo_config 'share_asn_token'). La pagina lista las ASN con celulares
// pendientes de control; dentro de cada una se tildan los IMEIs al escanear.
// La marca del control vive en la pestaña ASN de /compras/envios, y el aviso
// de diferencias a GOcelular es SIEMPRE manual (decisiones de Emiliano 26/11).

import { createHash, randomUUID } from 'crypto'
import { revalidatePath } from 'next/cache'
import { getPool } from '@/lib/db-pool'
import { createAdminClient } from '@/lib/supabase/admin'
import { compararLectura, normalizarScan, textoNovedadDiferencias, type ResultadoControl } from '@/lib/asn-control'
import { enviarNovedadGocelular } from '@/lib/actions/novedades'

export interface ControlAsn {
  id: number
  asn_id: string
  asn_transaccion: string
  estado: string
  leidos: string[]
  sobrantes: string[]
  nota: string | null
  finalizado_at: string | null
  novedad_enviada_at: string | null
}

// --- Token unico -----------------------------------------------------------

async function tokenUnico(): Promise<string> {
  const supabase = createAdminClient()
  const { data } = await supabase.from('flujo_config').select('value').eq('key', 'share_asn_token').maybeSingle()
  if (data?.value) return data.value as string
  const token = randomUUID()
  await supabase.from('flujo_config').upsert({ key: 'share_asn_token', value: token })
  return token
}

async function tokenValido(token: string | undefined): Promise<boolean> {
  if (!token || token.length < 20) return false
  return token === (await tokenUnico())
}

/** Link completo para mandarle a Andreani (lo usa el boton Copiar de la pestaña ASN). */
export async function getShareAsnToken(): Promise<string> {
  return tokenUnico()
}

// --- Datos de la replica ---------------------------------------------------

async function imeisDeAsn(asnId: string): Promise<string[]> {
  const pool = getPool()
  if (!pool) return []
  const { rows } = await pool.query<{ imei: string }>(
    `SELECT imei FROM inventory_intake_items WHERE asn_transaction_id = $1 ORDER BY imei`,
    [asnId],
  )
  return rows.map(r => r.imei)
}

// --- Lado publico (operario del deposito, link unico) ----------------------

export interface AsnPendiente {
  asnId: string
  transaccion: string
  fecha: string
  imeis: number
}

/** ASNs con celulares (IMEIs) de los ultimos 60 dias que aun no tienen
 *  control finalizado — es lo unico que ve el deposito en el link. */
export async function getAsnsPendientesPublico(token: string): Promise<AsnPendiente[] | null> {
  if (!(await tokenValido(token))) return null
  const pool = getPool()
  if (!pool) return []
  const { rows } = await pool.query<{ id: string; id_transaccion: string; created_at: string; imeis: string }>(
    `SELECT t.id, t.id_transaccion, t.created_at, d.total AS imeis
     FROM andreani_wh_transactions t
     JOIN LATERAL (
       SELECT count(*) AS total FROM inventory_intake_items ii WHERE ii.asn_transaction_id = t.id
     ) d ON true
     WHERE t.tipo = 'abastecimiento' AND t.superseded_at IS NULL
       AND t.created_at >= now() - interval '60 days'
       AND d.total > 0
     ORDER BY t.created_at DESC`,
  )
  const supabase = createAdminClient()
  const { data: finalizados } = await supabase
    .from('asn_controles')
    .select('asn_id')
    .eq('estado', 'finalizado')
    .in('asn_id', rows.map(r => r.id))
  const ya = new Set((finalizados ?? []).map(f => f.asn_id))
  return rows
    .filter(r => !ya.has(r.id))
    .map(r => ({ asnId: r.id, transaccion: r.id_transaccion, fecha: r.created_at, imeis: Number(r.imeis) }))
}

export interface ChecklistAsn {
  asnId: string
  transaccion: string
  /** Unidades esperadas POR MODELO — el operario nunca ve los IMEIs */
  modelos: { modelo: string; total: number }[]
  /** sha256(token + imei normalizado) → modelo: el cliente valida cada escaneo
   *  contra esto sin conocer la lista (anti-trampa, pedido de Emiliano 26/11) */
  hashes: Record<string, string>
  totalEsperados: number
  finalizado: boolean
  /** solo CANTIDADES para el operario (los IMEIs del detalle los ve Emiliano en la pestaña ASN) */
  resumenFinal: { ok: number; faltantes: number; sobrantes: number } | null
}

function hashImei(token: string, imei: string): string {
  return createHash('sha256').update(`${token}:${normalizarScan(imei)}`).digest('hex')
}

export async function getChecklistAsn(token: string, asnId: string): Promise<ChecklistAsn | null> {
  if (!(await tokenValido(token))) return null
  const pool = getPool()
  if (!pool) return null
  const { rows } = await pool.query<{ id: string; id_transaccion: string }>(
    `SELECT id, id_transaccion FROM andreani_wh_transactions WHERE id = $1 AND tipo = 'abastecimiento'`,
    [asnId],
  )
  const asn = rows[0]
  if (!asn) return null

  // IMEIs esperados con su modelo (nombre GOcelular; fallback al alias de la linea)
  const { rows: items } = await pool.query<{ imei: string; modelo: string }>(
    `SELECT ii.imei, COALESCE(dm.name, ii.resolved_sku, ii.model_code, 'Sin modelo') AS modelo
     FROM inventory_intake_items ii
     LEFT JOIN device_models dm ON dm.model_code = ii.model_code
     WHERE ii.asn_transaction_id = $1`,
    [asn.id],
  )
  const porModelo = new Map<string, number>()
  const hashes: Record<string, string> = {}
  for (const it of items) {
    porModelo.set(it.modelo, (porModelo.get(it.modelo) ?? 0) + 1)
    hashes[hashImei(token, it.imei)] = it.modelo
  }

  const supabase = createAdminClient()
  const { data: c } = await supabase.from('asn_controles').select('*').eq('asn_id', asn.id).maybeSingle()
  const finalizado = c?.estado === 'finalizado'
  let resumenFinal: ChecklistAsn['resumenFinal'] = null
  if (finalizado) {
    const r = compararLectura(items.map(i => i.imei), c?.leidos ?? [], c?.sobrantes ?? [])
    resumenFinal = { ok: r.ok.length, faltantes: r.faltantes.length, sobrantes: r.sobrantes.length }
  }
  return {
    asnId: asn.id,
    transaccion: asn.id_transaccion,
    modelos: [...porModelo.entries()].map(([modelo, total]) => ({ modelo, total })).sort((a, b) => b.total - a.total),
    hashes,
    totalEsperados: items.length,
    finalizado,
    resumenFinal,
  }
}

export async function finalizarControlAsn(
  token: string,
  asnId: string,
  leidos: string[],
  sobrantes: string[],
  nota: string,
): Promise<{ ok?: true; error?: string }> {
  if (!(await tokenValido(token))) return { error: 'Link invalido' }
  if (leidos.length > 5000 || sobrantes.length > 5000) return { error: 'Demasiados escaneos' }
  const pool = getPool()
  if (!pool) return { error: 'Base no disponible' }
  const { rows } = await pool.query<{ id_transaccion: string }>(
    `SELECT id_transaccion FROM andreani_wh_transactions WHERE id = $1 AND tipo = 'abastecimiento'`,
    [asnId],
  )
  if (!rows[0]) return { error: 'ASN inexistente' }
  const supabase = createAdminClient()
  const { data: previo } = await supabase.from('asn_controles').select('estado').eq('asn_id', asnId).maybeSingle()
  if (previo?.estado === 'finalizado') return { error: 'Este control ya fue finalizado' }
  const { error } = await supabase.from('asn_controles').upsert(
    {
      asn_id: asnId,
      asn_transaccion: rows[0].id_transaccion,
      estado: 'finalizado',
      leidos: leidos.map(normalizarScan).slice(0, 5000),
      sobrantes: sobrantes.map(normalizarScan).slice(0, 5000),
      nota: nota.trim().slice(0, 500) || null,
      finalizado_at: new Date().toISOString(),
    },
    { onConflict: 'asn_id' },
  )
  if (error) return { error: error.message }
  revalidatePath('/compras/envios')
  return { ok: true }
}

// --- Lado admin (pestaña ASN de /compras/envios) ---------------------------

export interface ControlConResultado extends ControlAsn {
  resultado: ResultadoControl
}

/** Controles finalizados, por asn_id, con su resultado — para la marca en la pestaña ASN. */
export async function getControlesAsn(): Promise<Record<string, ControlConResultado>> {
  const supabase = createAdminClient()
  const { data } = await supabase.from('asn_controles').select('*').eq('estado', 'finalizado')
  const out: Record<string, ControlConResultado> = {}
  for (const c of data ?? []) {
    const esperados = await imeisDeAsn(c.asn_id)
    out[c.asn_id] = { ...(c as ControlAsn), resultado: compararLectura(esperados, c.leidos ?? [], c.sobrantes ?? []) }
  }
  return out
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
  revalidatePath('/compras/envios')
  return { ok: true }
}
