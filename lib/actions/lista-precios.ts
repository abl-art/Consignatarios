'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProductoConPrecio {
  id: string
  nombre: string
  codigo: string
  mejor_precio: number
  oculto_lista_precios: boolean
}

// ---------------------------------------------------------------------------
// MUP config
// ---------------------------------------------------------------------------

export async function getMupConfig(): Promise<number> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('lista_precios_config')
    .select('mup')
    .eq('id', 1)
    .single()

  if (error || !data) return 30
  return data.mup ?? 30
}

export async function actualizarMup(porcentaje: number) {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('lista_precios_config')
    .update({ mup: porcentaje, updated_at: new Date().toISOString() })
    .eq('id', 1)

  if (error) return { error: error.message }

  revalidatePath('/consignatarios/lista-precios')
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Visibilidad
// ---------------------------------------------------------------------------

export async function toggleVisibilidadListaPrecios(productoId: string, oculto: boolean) {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('compras_productos')
    .update({ oculto_lista_precios: oculto })
    .eq('id', productoId)

  if (error) return { error: error.message }

  revalidatePath('/consignatarios/lista-precios')
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Productos con mejor precio
// ---------------------------------------------------------------------------

export async function getProductosCelularesConPrecio(): Promise<ProductoConPrecio[]> {
  const supabase = createAdminClient()

  // 1. Fetch visible celulares
  const { data: productos, error: prodError } = await supabase
    .from('compras_productos')
    .select('id, nombre, codigo, oculto_lista_precios')
    .eq('categoria', 'Celulares')
    .eq('oculto', false)
    .order('nombre', { ascending: true })

  if (prodError || !productos || productos.length === 0) return []

  // 2. Fetch all prices
  const { data: precios, error: preciosError } = await supabase
    .from('compras_precios')
    .select('producto_id, precio')

  if (preciosError || !precios) return []

  // 3. Build map of best (minimum) price per product
  const mejorPrecioPorProducto = new Map<string, number>()
  for (const p of precios) {
    const current = mejorPrecioPorProducto.get(p.producto_id)
    if (current === undefined || p.precio < current) {
      mejorPrecioPorProducto.set(p.producto_id, p.precio)
    }
  }

  // 4. Return only products that have at least one price
  return productos
    .filter((prod) => mejorPrecioPorProducto.has(prod.id))
    .map((prod) => ({
      id: prod.id,
      nombre: prod.nombre,
      codigo: prod.codigo,
      mejor_precio: mejorPrecioPorProducto.get(prod.id)!,
      oculto_lista_precios: prod.oculto_lista_precios ?? false,
    }))
}
