'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProveedorInput {
  nombre: string
  contacto: string
  whatsapp: string
  email: string
  cuit: string
  direccion: string
  notas: string
}

interface ProductoInput {
  codigo: string
  nombre: string
  categoria: string
}

// ---------------------------------------------------------------------------
// CRUD: compras_proveedores
// ---------------------------------------------------------------------------

export async function getProveedores() {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('compras_proveedores')
    .select('*')
    .order('nombre', { ascending: true })
  if (error || !data) return []
  return data
}

export async function agregarProveedor(input: ProveedorInput) {
  const supabase = createAdminClient()
  const { error } = await supabase.from('compras_proveedores').insert({
    nombre: input.nombre,
    contacto: input.contacto,
    whatsapp: input.whatsapp,
    email: input.email,
    cuit: input.cuit,
    direccion: input.direccion,
    notas: input.notas,
  })
  if (error) return { error: error.message }
  revalidatePath('/compras')
  return { ok: true }
}

export async function editarProveedor(id: string, input: ProveedorInput) {
  const supabase = createAdminClient()
  const { error } = await supabase.from('compras_proveedores').update({
    nombre: input.nombre,
    contacto: input.contacto,
    whatsapp: input.whatsapp,
    email: input.email,
    cuit: input.cuit,
    direccion: input.direccion,
    notas: input.notas,
  }).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/compras')
  return { ok: true }
}

export async function eliminarProveedor(id: string) {
  const supabase = createAdminClient()
  const { error } = await supabase.from('compras_proveedores').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/compras')
  return { ok: true }
}

// ---------------------------------------------------------------------------
// CRUD: compras_productos
// ---------------------------------------------------------------------------

export async function getProductos() {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('compras_productos')
    .select('*')
    .order('nombre', { ascending: true })
  if (error || !data) return []
  return data
}

export async function agregarProducto(input: ProductoInput) {
  const supabase = createAdminClient()
  const { error } = await supabase.from('compras_productos').insert({
    codigo: input.codigo,
    nombre: input.nombre,
    categoria: input.categoria,
  })
  if (error) return { error: error.message }
  revalidatePath('/compras')
  return { ok: true }
}

export async function editarProducto(id: string, input: ProductoInput) {
  const supabase = createAdminClient()
  const { error } = await supabase.from('compras_productos').update({
    codigo: input.codigo,
    nombre: input.nombre,
    categoria: input.categoria,
  }).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/compras')
  return { ok: true }
}

export async function eliminarProducto(id: string) {
  const supabase = createAdminClient()
  const { error } = await supabase.from('compras_productos').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/compras')
  return { ok: true }
}

// ---------------------------------------------------------------------------
// CRUD: compras_precios
// ---------------------------------------------------------------------------

export async function getPrecios(): Promise<{ id: string; producto_id: string; proveedor_id: string; precio: number; plazo: string }[]> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('compras_precios')
    .select('id, producto_id, proveedor_id, precio, plazo')
  if (error || !data) return []

  return (data as { id: string; producto_id: string; proveedor_id: string; precio: number; plazo: string }[]).map((r) => ({
    ...r,
    precio: Number(r.precio),
  }))
}

export async function setPrecio(producto_id: string, proveedor_id: string, precio: number, plazo: string) {
  const supabase = createAdminClient()
  const { error } = await supabase.from('compras_precios').upsert({
    producto_id,
    proveedor_id,
    precio,
    plazo,
  }, { onConflict: 'producto_id,proveedor_id' })
  if (error) return { error: error.message }
  revalidatePath('/compras')
  return { ok: true }
}

export async function eliminarPrecio(producto_id: string, proveedor_id: string) {
  const supabase = createAdminClient()
  const { error } = await supabase.from('compras_precios').delete()
    .eq('producto_id', producto_id)
    .eq('proveedor_id', proveedor_id)
  if (error) return { error: error.message }
  revalidatePath('/compras')
  return { ok: true }
}
