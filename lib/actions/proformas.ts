'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProformaItem {
  id?: string
  producto_id: string
  producto_nombre: string
  cantidad: number
  precio_costo: number
  precio_venta_neto: number
  iva: number
  subtotal_con_iva: number
}

export interface Proforma {
  id: string
  nombre: string
  cliente_nombre: string
  store_id: string | null
  fecha: string
  mup: number
  estado: 'borrador' | 'confirmada'
  total_neto: number
  total_iva: number
  total_con_iva: number
  notas: string | null
  created_at: string
}

export interface ProformaConItems extends Proforma {
  proforma_items: ProformaItem[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function calcularItems(
  rawItems: { producto_id: string; producto_nombre: string; cantidad: number; precio_costo: number }[],
  mup: number
): ProformaItem[] {
  return rawItems.map(item => {
    const precio_venta_neto = Math.round(item.precio_costo * (1 + mup / 100))
    const iva = Math.round(precio_venta_neto * 0.21)
    const subtotal_con_iva = (precio_venta_neto + iva) * item.cantidad
    return {
      producto_id: item.producto_id,
      producto_nombre: item.producto_nombre,
      cantidad: item.cantidad,
      precio_costo: item.precio_costo,
      precio_venta_neto,
      iva,
      subtotal_con_iva,
    }
  })
}

// ---------------------------------------------------------------------------
// Crear proforma
// ---------------------------------------------------------------------------

export async function crearProforma(data: {
  nombre: string
  cliente_nombre: string
  store_id: string
  mup: number
  notas: string
  items: { producto_id: string; producto_nombre: string; cantidad: number; precio_costo: number }[]
}) {
  const supabase = createAdminClient()

  const items = calcularItems(data.items, data.mup)
  const total_neto = items.reduce((s, i) => s + i.precio_venta_neto * i.cantidad, 0)
  const total_iva = items.reduce((s, i) => s + i.iva * i.cantidad, 0)
  const total_con_iva = items.reduce((s, i) => s + i.subtotal_con_iva, 0)

  const { data: proforma, error } = await supabase
    .from('proformas')
    .insert({
      nombre: data.nombre,
      cliente_nombre: data.cliente_nombre,
      store_id: data.store_id || null,
      mup: data.mup,
      estado: 'borrador',
      total_neto,
      total_iva,
      total_con_iva,
      notas: data.notas || null,
    })
    .select('id')
    .single()

  if (error || !proforma) return { error: error?.message ?? 'Error al crear proforma' }

  const { error: itemsError } = await supabase
    .from('proforma_items')
    .insert(items.map(i => ({ ...i, proforma_id: proforma.id })))

  if (itemsError) return { error: itemsError.message }

  revalidatePath('/consignatarios/proformas')
  return { ok: true, id: proforma.id }
}

// ---------------------------------------------------------------------------
// Modificar proforma (solo borradores)
// ---------------------------------------------------------------------------

export async function modificarProforma(id: string, data: {
  nombre: string
  cliente_nombre: string
  store_id: string
  mup: number
  notas: string
  items: { producto_id: string; producto_nombre: string; cantidad: number; precio_costo: number }[]
}) {
  const supabase = createAdminClient()

  // Verificar que sea borrador
  const { data: existing } = await supabase.from('proformas').select('estado').eq('id', id).single()
  if (!existing || existing.estado !== 'borrador') return { error: 'Solo se pueden modificar proformas en borrador' }

  const items = calcularItems(data.items, data.mup)
  const total_neto = items.reduce((s, i) => s + i.precio_venta_neto * i.cantidad, 0)
  const total_iva = items.reduce((s, i) => s + i.iva * i.cantidad, 0)
  const total_con_iva = items.reduce((s, i) => s + i.subtotal_con_iva, 0)

  const { error } = await supabase
    .from('proformas')
    .update({
      nombre: data.nombre,
      cliente_nombre: data.cliente_nombre,
      store_id: data.store_id || null,
      mup: data.mup,
      total_neto,
      total_iva,
      total_con_iva,
      notas: data.notas || null,
    })
    .eq('id', id)

  if (error) return { error: error.message }

  // Reemplazar items
  await supabase.from('proforma_items').delete().eq('proforma_id', id)
  const { error: itemsError } = await supabase
    .from('proforma_items')
    .insert(items.map(i => ({ ...i, proforma_id: id })))

  if (itemsError) return { error: itemsError.message }

  revalidatePath('/consignatarios/proformas')
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Confirmar proforma
// ---------------------------------------------------------------------------

export async function confirmarProforma(id: string) {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('proformas')
    .update({ estado: 'confirmada' })
    .eq('id', id)
    .eq('estado', 'borrador')

  if (error) return { error: error.message }
  revalidatePath('/consignatarios/proformas')
  revalidatePath('/consignatarios/asignaciones')
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Listar proformas
// ---------------------------------------------------------------------------

export async function getProformas(): Promise<Proforma[]> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('proformas')
    .select('*')
    .order('created_at', { ascending: false })

  if (error || !data) return []
  return data
}

// ---------------------------------------------------------------------------
// Listar proformas confirmadas (para asignaciones)
// ---------------------------------------------------------------------------

export async function getProformasConfirmadas(): Promise<ProformaConItems[]> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('proformas')
    .select('*, proforma_items(*)')
    .eq('estado', 'confirmada')
    .order('created_at', { ascending: false })

  if (error || !data) return []
  return data
}

// ---------------------------------------------------------------------------
// Obtener una proforma con items
// ---------------------------------------------------------------------------

export async function getProformaConItems(id: string): Promise<ProformaConItems | null> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('proformas')
    .select('*, proforma_items(*)')
    .eq('id', id)
    .single()

  if (error || !data) return null
  return data
}

// ---------------------------------------------------------------------------
// Eliminar proforma (solo borradores)
// ---------------------------------------------------------------------------

export async function eliminarProforma(id: string) {
  const supabase = createAdminClient()
  const { error } = await supabase.from('proformas').delete().eq('id', id).eq('estado', 'borrador')
  if (error) return { error: error.message }
  revalidatePath('/consignatarios/proformas')
  return { ok: true }
}
