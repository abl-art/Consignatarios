'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { fetchDispositivosPorImei } from '@/lib/gocelular'
import {
  armarSiniestrosStock,
  TIPOS_SINIESTRO_STOCK,
  type SiniestroStock,
  type SiniestroStockRow,
  type TipoSiniestroStock,
} from '@/lib/siniestros-stock'

function aRow(r: {
  id: string; producto: string; sku: string | null; imei: string | null
  tipo: string; fecha: string; nota: string | null; estado: string
  resuelto_at: string | null; nota_credito: boolean; created_at: string
}): SiniestroStockRow {
  return {
    id: r.id,
    producto: r.producto,
    sku: r.sku,
    imei: r.imei,
    tipo: r.tipo as TipoSiniestroStock,
    fecha: r.fecha,
    nota: r.nota,
    estado: r.estado as 'abierto' | 'resuelto',
    resueltoAt: r.resuelto_at,
    notaCredito: r.nota_credito,
    createdAt: r.created_at,
  }
}

/**
 * Siniestros de almacenamiento (siniestros_stock en Supabase) enriquecidos
 * con los datos del equipo en GOcelular cuando se cargó IMEI.
 */
export async function getSiniestrosStock(): Promise<SiniestroStock[]> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('siniestros_stock')
    .select('id, producto, sku, imei, tipo, fecha, nota, estado, resuelto_at, nota_credito, created_at')
  if (error || !data) return []

  const rows = data.map(aRow)
  const imeis = rows.map(r => r.imei).filter((i): i is string => i !== null)
  const dispositivos = await fetchDispositivosPorImei(imeis).catch(() => [])
  return armarSiniestrosStock(rows, dispositivos, new Date())
}

export async function cargarSiniestroStock(input: {
  producto: string
  sku: string | null
  tipo: string
  imei?: string
  fecha?: string
  nota?: string
}): Promise<{ ok?: true; error?: string }> {
  const producto = input.producto.trim()
  if (!producto) return { error: 'Elegí el producto siniestrado.' }
  if (!TIPOS_SINIESTRO_STOCK.includes(input.tipo as TipoSiniestroStock)) {
    return { error: 'Elegí el tipo de siniestro (extraviado, roto o hurtado).' }
  }
  const imei = input.imei?.trim() || null
  if (imei && !/^\d{14,16}$/.test(imei)) {
    return { error: 'El IMEI debe tener 15 dígitos (dejalo vacío si no lo sabés).' }
  }

  const supabase = createAdminClient()
  const { error } = await supabase.from('siniestros_stock').insert({
    producto,
    sku: input.sku,
    imei,
    tipo: input.tipo,
    ...(input.fecha ? { fecha: input.fecha } : {}),
    nota: input.nota?.trim() || null,
  })
  if (error) return { error: error.message }

  revalidatePath('/compras/envios')
  return { ok: true }
}

export async function setNotaCreditoStock(id: string, emitida: boolean): Promise<{ ok?: true; error?: string }> {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('siniestros_stock')
    .update({ nota_credito: emitida, nota_credito_at: emitida ? new Date().toISOString() : null })
    .eq('id', id)
  if (error) return { error: error.message }

  revalidatePath('/compras/envios')
  return { ok: true }
}

export async function setEstadoSiniestroStock(id: string, resuelto: boolean): Promise<{ ok?: true; error?: string }> {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('siniestros_stock')
    .update({ estado: resuelto ? 'resuelto' : 'abierto', resuelto_at: resuelto ? new Date().toISOString() : null })
    .eq('id', id)
  if (error) return { error: error.message }

  revalidatePath('/compras/envios')
  return { ok: true }
}

export async function setNotaSiniestroStock(id: string, nota: string): Promise<{ ok?: true; error?: string }> {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('siniestros_stock')
    .update({ nota: nota.trim() || null })
    .eq('id', id)
  if (error) return { error: error.message }

  revalidatePath('/compras/envios')
  return { ok: true }
}
