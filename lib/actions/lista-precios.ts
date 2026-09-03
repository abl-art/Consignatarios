'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { elegirCosto, type CostoProveedor } from '@/lib/lista-precios'
import { normalizarMarca } from '@/lib/marca'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProductoConPrecio {
  id: string
  nombre: string
  codigo: string
  // Costo de referencia con la MISMA regla que la Lista de Precios de
  // Canales (elegirCosto): el proveedor preferido de la marca aunque no sea
  // el más barato; sin precio ahí, el más barato del resto. Siempre sobre la
  // ÚLTIMA actualización de cada proveedor.
  mejor_precio: number
  proveedor: string
  proveedor_preferido: boolean
  oculto_lista_precios: boolean
}

// ---------------------------------------------------------------------------
// MUP config
// ---------------------------------------------------------------------------

export async function getMupConfig(): Promise<number> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('lista_precios_config')
    .select('mup_porcentaje')
    .eq('id', 1)
    .single()

  if (error || !data) return 30
  return data.mup_porcentaje ?? 30
}

export async function actualizarMup(porcentaje: number) {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('lista_precios_config')
    .update({ mup_porcentaje: porcentaje, updated_at: new Date().toISOString() })
    .eq('id', 1)

  if (error) return { error: error.message }

  revalidatePath('/consignatarios/lista-precios')
  revalidatePath('/api/pdf/lista-precios')
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

  // 2. Última actualización por (producto, proveedor) — vienen ordenados desc
  const [{ data: precios, error: preciosError }, { data: provs }] = await Promise.all([
    supabase
      .from('compras_precios')
      .select('producto_id, proveedor_id, precio, created_at')
      .order('created_at', { ascending: false }),
    supabase.from('compras_proveedores').select('id, nombre'),
  ])

  if (preciosError || !precios) return []
  const nombreProveedor = new Map<string, string>((provs ?? []).map(p => [p.id as string, p.nombre as string]))

  const vistos = new Set<string>()
  const costosPorProducto = new Map<string, CostoProveedor[]>()
  for (const p of precios) {
    const key = `${p.producto_id}|${p.proveedor_id}`
    if (vistos.has(key)) continue
    vistos.add(key)
    const proveedor = nombreProveedor.get(p.proveedor_id as string)
    if (!proveedor) continue
    const lista = costosPorProducto.get(p.producto_id as string) ?? []
    lista.push({ proveedor, precio: Number(p.precio) })
    costosPorProducto.set(p.producto_id as string, lista)
  }

  // 3. Costo de referencia con la regla de Canales: preferido de la marca,
  //    fallback el más barato del resto (elegirCosto compartida)
  const resultado: ProductoConPrecio[] = []
  for (const prod of productos) {
    const marca = normalizarMarca((prod.nombre as string).split(/\s+/)[0] ?? null) ?? '—'
    const eleccion = elegirCosto(marca, costosPorProducto.get(prod.id) ?? [])
    if (!eleccion) continue
    resultado.push({
      id: prod.id,
      nombre: prod.nombre,
      codigo: prod.codigo,
      mejor_precio: eleccion.costo.precio,
      proveedor: eleccion.costo.proveedor,
      proveedor_preferido: eleccion.preferido,
      oculto_lista_precios: prod.oculto_lista_precios ?? false,
    })
  }
  return resultado
}
