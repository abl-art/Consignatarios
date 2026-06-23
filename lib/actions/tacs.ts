'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getPool } from '@/lib/db-pool'
import { revalidatePath } from 'next/cache'

export interface TacCargado {
  tac: string
  marca: string
  modelo: string
  origen: string
  estado: 'solicitado' | 'cargado'
  created_at: string
}

export interface TacInventario {
  tac: string
  marca: string
  modelo: string
}

export interface TacPendiente {
  tac: string
  marca: string
  modelo: string
  origen: 'inventario' | 'terceros' | 'TAC is not in the database'
}

// Marcas excluidas de Trustonic (no necesitan carga de TAC)
const MARCAS_EXCLUIDAS = ['samsung', 'apple']

// Fetch TACs únicos de inventory_items + devices (excluyendo Samsung/Apple)
async function fetchTacsInventario(): Promise<TacInventario[]> {
  const pool = getPool()
  if (!pool) return []

  const client = await pool.connect()
  try {
    const res = await client.query<{ tac: string; marca: string; modelo: string }>(
      `SELECT DISTINCT tac, marca, modelo FROM (
        -- Fuente 1: inventory_items (stock ecommerce)
        SELECT
          SUBSTRING(ii.imei, 1, 8) AS tac,
          COALESCE(dm.brand, 'Desconocido') AS marca,
          COALESCE(dm.name, ii.model_code) AS modelo
        FROM inventory_items ii
        LEFT JOIN device_models dm ON dm.model_code = ii.model_code
        WHERE ii.imei IS NOT NULL AND LENGTH(ii.imei) >= 8
          AND SUBSTRING(ii.imei, 1, 8) != '00000000'

        UNION

        -- Fuente 2: devices (ventas consignatarios/terceros)
        SELECT
          SUBSTRING(d.imei, 1, 8) AS tac,
          COALESCE(d.brand, 'Desconocido') AS marca,
          COALESCE(d.model, 'Desconocido') AS modelo
        FROM devices d
        WHERE d.imei IS NOT NULL AND LENGTH(d.imei) >= 8
          AND SUBSTRING(d.imei, 1, 8) != '00000000'
          AND (d.is_test_device = false OR d.is_test_device IS NULL)
          AND LOWER(COALESCE(d.brand, '')) NOT LIKE '%samsung%'
          AND LOWER(COALESCE(d.brand, '')) NOT LIKE '%apple%'
      ) AS all_tacs
       ORDER BY marca, modelo`
    )
    return res.rows.filter(r => !MARCAS_EXCLUIDAS.includes(r.marca.toLowerCase()))
  } finally {
    client.release()
  }
}

// Fetch TACs ya cargados de Supabase
export async function fetchTacsCargados(): Promise<TacCargado[]> {
  const sb = createAdminClient()
  const { data } = await sb.from('tacs_cargados').select('*').order('marca').order('modelo')
  return (data ?? []) as TacCargado[]
}

// Fetch TACs de enrollments fallidos en Trustonic (TAC_NOT_EXIST)
async function fetchTacsEnrollFallido(): Promise<TacPendiente[]> {
  const pool = getPool()
  if (!pool) return []

  const client = await pool.connect()
  try {
    const res = await client.query<{ tac: string; marca: string; modelo: string }>(
      `SELECT DISTINCT sub.tac,
        COALESCE(
          (SELECT d2.brand FROM devices d2 WHERE SUBSTRING(d2.imei, 1, 8) = sub.tac AND d2.brand IS NOT NULL LIMIT 1),
          (SELECT dm.brand FROM inventory_items ii JOIN device_models dm ON dm.model_code = ii.model_code WHERE SUBSTRING(ii.imei, 1, 8) = sub.tac LIMIT 1),
          'Desconocido'
        ) AS marca,
        COALESCE(
          (SELECT d2.model FROM devices d2 WHERE SUBSTRING(d2.imei, 1, 8) = sub.tac AND d2.model IS NOT NULL LIMIT 1),
          (SELECT dm.name FROM inventory_items ii JOIN device_models dm ON dm.model_code = ii.model_code WHERE SUBSTRING(ii.imei, 1, 8) = sub.tac LIMIT 1),
          'Desconocido'
        ) AS modelo
      FROM (
        SELECT DISTINCT SUBSTRING(device_imei, 1, 8) AS tac
        FROM device_actions_log
        WHERE action_type = 'enroll' AND result = 'failed'
          AND error_details LIKE '%TAC is not in the database%'
      ) sub
      ORDER BY marca, modelo`
    )
    return res.rows.map(r => ({ ...r, origen: 'TAC is not in the database' as const }))
  } finally {
    client.release()
  }
}

// Detectar TACs nuevos (en inventario/devices/enroll fallido pero no en tacs_cargados)
export async function detectarTacsPendientes(): Promise<TacPendiente[]> {
  const [inventario, enrollFallido, cargados] = await Promise.all([
    fetchTacsInventario(),
    fetchTacsEnrollFallido(),
    fetchTacsCargados(),
  ])

  const cargadosSet = new Set(cargados.map(t => t.tac))
  const pendientes: TacPendiente[] = []
  const tacsSeen = new Set<string>()

  // Primero inventario (tiene mejor info de marca/modelo)
  for (const t of inventario) {
    if (!cargadosSet.has(t.tac)) {
      pendientes.push({ ...t, origen: 'inventario' })
      tacsSeen.add(t.tac)
    }
  }

  // Luego enroll fallido (solo si no vino de inventario)
  for (const t of enrollFallido) {
    if (!cargadosSet.has(t.tac) && !tacsSeen.has(t.tac)) {
      pendientes.push(t)
    }
  }

  return pendientes
}

// Contar TACs pendientes (para badge del sidebar)
export async function contarTacsPendientes(): Promise<number> {
  const pendientes = await detectarTacsPendientes()
  return pendientes.length
}

// Guardar TACs como "Carga Solicitada" (estado = solicitado)
export async function solicitarCargaTacs(tacs: { tac: string; marca: string; modelo: string; origen: string }[]) {
  if (tacs.length === 0) return { ok: true }
  const sb = createAdminClient()

  for (const t of tacs) {
    await sb.from('tacs_cargados').upsert({
      tac: t.tac,
      marca: t.marca,
      modelo: t.modelo,
      origen: t.origen,
      estado: 'solicitado',
    }, { onConflict: 'tac' })
  }

  revalidatePath('/gestion-tacs')
  return { ok: true }
}

// Confirmar TACs como cargados en Trustonic (estado = cargado)
export async function confirmarTacsCargados(tacs: string[]) {
  if (tacs.length === 0) return { ok: true }
  const sb = createAdminClient()

  for (const tac of tacs) {
    await sb.from('tacs_cargados').update({ estado: 'cargado' }).eq('tac', tac)
  }

  revalidatePath('/gestion-tacs')
  return { ok: true }
}

// Legacy: marcar directo como cargados (para sincronización inventario)
export async function marcarTacsCargados(tacs: { tac: string; marca: string; modelo: string; origen: string }[]) {
  if (tacs.length === 0) return { ok: true }
  const sb = createAdminClient()

  for (const t of tacs) {
    await sb.from('tacs_cargados').upsert({
      tac: t.tac,
      marca: t.marca,
      modelo: t.modelo,
      origen: t.origen,
      estado: 'cargado',
    }, { onConflict: 'tac' })
  }

  revalidatePath('/gestion-tacs')
  return { ok: true }
}

// Procesar archivo de terceros: recibe array de {imei, marca, modelo}
// Retorna TACs nuevos que no están en tacs_cargados
export async function procesarArchivoTerceros(items: { imei: string; marca: string; modelo: string }[]): Promise<TacPendiente[]> {
  const cargados = await fetchTacsCargados()
  const cargadosSet = new Set(cargados.map(t => t.tac))

  const tacsSeen = new Set<string>()
  const pendientes: TacPendiente[] = []

  for (const item of items) {
    if (MARCAS_EXCLUIDAS.includes(item.marca.toLowerCase())) continue
    const imei = item.imei.replace(/\D/g, '')
    if (imei.length < 8) continue
    const tac = imei.substring(0, 8)
    if (tac === '00000000' || cargadosSet.has(tac) || tacsSeen.has(tac)) continue
    tacsSeen.add(tac)
    pendientes.push({ tac, marca: item.marca, modelo: item.modelo, origen: 'terceros' })
  }

  return pendientes
}

// Carga inicial: sincronizar inventario GOcelular → tacs_cargados
export async function sincronizarTacsInventario() {
  const inventario = await fetchTacsInventario()
  const cargados = await fetchTacsCargados()
  const cargadosSet = new Set(cargados.map(t => t.tac))

  const nuevos = inventario.filter(t => !cargadosSet.has(t.tac))
  if (nuevos.length === 0) return { ok: true, nuevos: 0 }

  await marcarTacsCargados(nuevos.map(t => ({ ...t, origen: 'inventario' })))
  revalidatePath('/gestion-tacs')
  return { ok: true, nuevos: nuevos.length }
}
