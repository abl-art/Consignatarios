'use server'

// Datos para /canales/lista-precios: costos por proveedor del gestor de
// Compras + múltiplos editables (flujo_config) + precio tienda y ventas 30d
// de GOcelular. El armado puro vive en lib/lista-precios.ts.

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchPreciosTiendaCelulares, fetchVentasPorModelo } from '@/lib/gocelular'
import {
  armarListaPrecios,
  type CostoProveedor,
  type FilaListaPrecios,
  type ProductoLista,
} from '@/lib/lista-precios'

const MULTIPLO_KEY = 'listaprecios_multiplo_'

export async function getListaPrecios(): Promise<FilaListaPrecios[]> {
  const supabase = createAdminClient()

  const [{ data: prods }, { data: precios }, { data: provs }, { data: cfg }, preciosTienda, ventasDiarias] =
    await Promise.all([
      supabase.from('compras_productos').select('id, nombre, codigo, categoria, oculto').eq('categoria', 'Celulares'),
      supabase.from('compras_precios').select('producto_id, proveedor_id, precio, created_at').order('created_at', { ascending: false }),
      supabase.from('compras_proveedores').select('id, nombre'),
      supabase.from('flujo_config').select('key, value').like('key', `${MULTIPLO_KEY}%`),
      fetchPreciosTiendaCelulares().catch(() => ({} as Record<string, number>)),
      fetchVentasPorModelo().catch(() => []),
    ])

  const productos: ProductoLista[] = (prods ?? [])
    .filter(p => !p.oculto)
    .map(p => ({ id: p.id as string, nombre: p.nombre as string, codigo: (p.codigo as string) || null }))

  const nombreProveedor = new Map<string, string>((provs ?? []).map(p => [p.id as string, p.nombre as string]))

  // última actualización por (producto, proveedor) — vienen ordenados desc
  const vistos = new Set<string>()
  const costosPorProducto: Record<string, CostoProveedor[]> = {}
  for (const p of precios ?? []) {
    const key = `${p.producto_id}|${p.proveedor_id}`
    if (vistos.has(key)) continue
    vistos.add(key)
    const proveedor = nombreProveedor.get(p.proveedor_id as string)
    if (!proveedor) continue
    ;(costosPorProducto[p.producto_id as string] ??= []).push({ proveedor, precio: Number(p.precio) })
  }

  const multiplos: Record<string, number> = {}
  for (const row of cfg ?? []) {
    const valor = Number(row.value)
    if (Number.isFinite(valor) && valor > 0) multiplos[(row.key as string).slice(MULTIPLO_KEY.length)] = valor
  }

  const desde = new Date()
  desde.setDate(desde.getDate() - 30)
  const corte = desde.toISOString().slice(0, 10)
  const ventas30d: Record<string, number> = {}
  for (const v of ventasDiarias) {
    if (v.fecha >= corte) ventas30d[v.modelo] = (ventas30d[v.modelo] ?? 0) + v.ventas
  }

  return armarListaPrecios(productos, costosPorProducto, multiplos, preciosTienda, ventas30d)
}

export async function setMultiploListaPrecios(productoId: string, multiplo: number) {
  if (!Number.isFinite(multiplo) || multiplo <= 0 || multiplo > 10) {
    return { error: 'El múltiplo debe ser un número mayor a 0' }
  }
  const supabase = createAdminClient()
  const { error } = await supabase.from('flujo_config').upsert({
    key: `${MULTIPLO_KEY}${productoId}`,
    value: String(multiplo),
    updated_at: new Date().toISOString(),
  })
  if (error) return { error: error.message }
  revalidatePath('/canales/lista-precios')
  return { ok: true }
}
