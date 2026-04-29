'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { Client } from 'pg'
import { revalidatePath } from 'next/cache'

export interface TacCargado {
  tac: string
  marca: string
  modelo: string
  origen: string
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
  origen: 'inventario' | 'terceros'
}

// Marcas excluidas de Trustonic (no necesitan carga de TAC)
const MARCAS_EXCLUIDAS = ['samsung', 'apple']

// Fetch TACs únicos del inventario de GOcelular (excluyendo marcas que no usan Trustonic)
async function fetchTacsInventario(): Promise<TacInventario[]> {
  const url = process.env.GOCELULAR_DB_URL
  if (!url) return []

  const client = new Client({ connectionString: url })
  await client.connect()
  try {
    const res = await client.query<{ tac: string; marca: string; modelo: string }>(
      `SELECT DISTINCT
        SUBSTRING(ii.imei, 1, 8) AS tac,
        COALESCE(dm.brand, 'Desconocido') AS marca,
        COALESCE(dm.name, ii.model_code) AS modelo
       FROM inventory_items ii
       LEFT JOIN device_models dm ON dm.model_code = ii.model_code
       WHERE ii.imei IS NOT NULL AND LENGTH(ii.imei) >= 8
         AND SUBSTRING(ii.imei, 1, 8) != '00000000'
       ORDER BY marca, modelo`
    )
    return res.rows.filter(r => !MARCAS_EXCLUIDAS.includes(r.marca.toLowerCase()))
  } finally {
    await client.end()
  }
}

// Fetch TACs ya cargados de Supabase
export async function fetchTacsCargados(): Promise<TacCargado[]> {
  const sb = createAdminClient()
  const { data } = await sb.from('tacs_cargados').select('*').order('marca').order('modelo')
  return (data ?? []) as TacCargado[]
}

// Detectar TACs nuevos (en inventario pero no en tacs_cargados)
export async function detectarTacsPendientes(): Promise<TacPendiente[]> {
  const [inventario, cargados] = await Promise.all([
    fetchTacsInventario(),
    fetchTacsCargados(),
  ])

  const cargadosSet = new Set(cargados.map(t => t.tac))
  const pendientes: TacPendiente[] = []

  for (const t of inventario) {
    if (!cargadosSet.has(t.tac)) {
      pendientes.push({ ...t, origen: 'inventario' })
    }
  }

  return pendientes
}

// Contar TACs pendientes (para badge del sidebar)
export async function contarTacsPendientes(): Promise<number> {
  const pendientes = await detectarTacsPendientes()
  return pendientes.length
}

// Marcar TACs como cargados (moverlos a tacs_cargados)
export async function marcarTacsCargados(tacs: { tac: string; marca: string; modelo: string; origen: string }[]) {
  if (tacs.length === 0) return { ok: true }
  const sb = createAdminClient()

  // Upsert para no fallar si ya existe
  for (const t of tacs) {
    await sb.from('tacs_cargados').upsert({
      tac: t.tac,
      marca: t.marca,
      modelo: t.modelo,
      origen: t.origen,
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
