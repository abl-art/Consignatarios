'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { verificarLimiteCC } from './pagos-mayoristas'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GocelularVentaEstado {
  estado: 'no_enviado' | 'validacion_fallida' | 'error_reintentable' | 'rechazado' | 'informado'
  saleId?: string
  faStatus?: string
  dispatchId?: string
  numeroOrdenExterna?: string
  enviadoAt?: string
  warnings?: string[]
  errores?: string[]
  codigoError?: string
  payloadEnviado?: string
}

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
  nro_proforma: number | null
  nombre: string
  cliente_nombre: string
  cliente_mayorista_id: string | null
  fecha: string
  fecha_confirmacion: string | null
  mup: number
  estado: 'borrador' | 'confirmada'
  total_neto: number
  total_iva: number
  total_con_iva: number
  notas: string | null
  origen: 'stock_local' | 'andreani_wh'
  gocelular: GocelularVentaEstado | null
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
  cliente_mayorista_id: string
  mup: number
  notas: string
  items: { producto_id: string; producto_nombre: string; cantidad: number; precio_costo: number }[]
  origen?: 'stock_local' | 'andreani_wh'
}) {
  const supabase = createAdminClient()

  // Get cliente name for display
  const { data: cliente } = await supabase.from('clientes_mayoristas').select('nombre_comercial').eq('id', data.cliente_mayorista_id).single()

  const items = calcularItems(data.items, data.mup)
  const total_neto = items.reduce((s, i) => s + i.precio_venta_neto * i.cantidad, 0)
  const total_iva = items.reduce((s, i) => s + i.iva * i.cantidad, 0)
  const total_con_iva = items.reduce((s, i) => s + i.subtotal_con_iva, 0)

  const { data: proforma, error } = await supabase
    .from('proformas')
    .insert({
      nombre: '',
      cliente_nombre: cliente?.nombre_comercial || '',
      cliente_mayorista_id: data.cliente_mayorista_id,
      mup: data.mup,
      estado: 'borrador',
      total_neto,
      total_iva,
      total_con_iva,
      notas: data.notas || null,
      origen: data.origen || 'stock_local',
    })
    .select('id')
    .single()

  if (error || !proforma) return { error: error?.message ?? 'Error al crear proforma' }

  const { error: itemsError } = await supabase
    .from('proforma_items')
    .insert(items.map(i => ({ ...i, proforma_id: proforma.id })))

  if (itemsError) return { error: itemsError.message }

  revalidatePath('/mayoristas/proformas')
  return { ok: true, id: proforma.id }
}

// ---------------------------------------------------------------------------
// Modificar proforma (solo borradores)
// ---------------------------------------------------------------------------

export async function modificarProforma(id: string, data: {
  cliente_mayorista_id: string
  mup: number
  notas: string
  items: { producto_id: string; producto_nombre: string; cantidad: number; precio_costo: number }[]
}) {
  const supabase = createAdminClient()

  // Verificar que sea borrador
  const { data: existing } = await supabase.from('proformas').select('estado').eq('id', id).single()
  if (!existing || existing.estado !== 'borrador') return { error: 'Solo se pueden modificar proformas en borrador' }

  // Get cliente name for display
  const { data: cliente } = await supabase.from('clientes_mayoristas').select('nombre_comercial').eq('id', data.cliente_mayorista_id).single()

  const items = calcularItems(data.items, data.mup)
  const total_neto = items.reduce((s, i) => s + i.precio_venta_neto * i.cantidad, 0)
  const total_iva = items.reduce((s, i) => s + i.iva * i.cantidad, 0)
  const total_con_iva = items.reduce((s, i) => s + i.subtotal_con_iva, 0)

  const { error } = await supabase
    .from('proformas')
    .update({
      cliente_nombre: cliente?.nombre_comercial || '',
      cliente_mayorista_id: data.cliente_mayorista_id,
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

  revalidatePath('/mayoristas/proformas')
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Confirmar proforma
// ---------------------------------------------------------------------------

export async function confirmarProforma(id: string) {
  const supabase = createAdminClient()

  // Check credit limit before confirming
  const { data: proforma } = await supabase
    .from('proformas')
    .select('cliente_mayorista_id, total_con_iva')
    .eq('id', id)
    .single()

  if (proforma?.cliente_mayorista_id) {
    const check = await verificarLimiteCC(proforma.cliente_mayorista_id, proforma.total_con_iva)
    if (!check.permitido) {
      return { error: check.mensaje }
    }
  }

  // Get next nro_proforma (starts at 145)
  const { data: maxRow } = await supabase
    .from('proformas')
    .select('nro_proforma')
    .not('nro_proforma', 'is', null)
    .order('nro_proforma', { ascending: false })
    .limit(1)
    .single()

  const nextNro = Math.max((maxRow?.nro_proforma ?? 144) + 1, 145)

  const { error } = await supabase
    .from('proformas')
    .update({
      estado: 'confirmada',
      nro_proforma: nextNro,
      fecha_confirmacion: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('estado', 'borrador')

  if (error) return { error: error.message }
  revalidatePath('/mayoristas/proformas')
  revalidatePath('/mayoristas/asignaciones')
  revalidatePath('/mayoristas/clientes')

  // Disparo automático del webhook de venta mayorista para warehouse Andreani — no bloqueante,
  // la confirmación ya quedó guardada aunque esto falle. stock_local se dispara aparte, al
  // completarse la asignación de IMEIs (ver prepararAsignacionMayorista en asignar.ts).
  // Select separado de `origen` (en vez de sumarlo al select de más arriba): si la migración de
  // Task 1 todavía no corrió, esta columna no existe — que falle acá no debe tumbar el chequeo
  // de límite de cuenta corriente de arriba, que sí sigue funcionando hoy.
  const { data: proformaOrigen } = await supabase.from('proformas').select('origen').eq('id', id).single()
  if (proformaOrigen?.origen === 'andreani_wh') {
    const { informarVentaGocelular } = await import('@/lib/actions/wholesale-webhook')
    await informarVentaGocelular(id).catch((e) => console.error('Error informando venta a GOcelular:', e))
  }

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
  revalidatePath('/mayoristas/proformas')
  return { ok: true }
}
