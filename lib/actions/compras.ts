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

// ---------------------------------------------------------------------------
// Pedidos (stored as JSON in flujo_config with key 'pedido_<id>')
// ---------------------------------------------------------------------------

interface PedidoItem {
  productoId: string
  productoNombre: string
  productoCodigo: string
  proveedorId: string
  proveedorNombre: string
  proveedorWhatsapp: string
  proveedorEmail: string
  precio: number
  plazo: string
  cantidad: number
}

interface Pedido {
  id: string
  proveedorId: string
  proveedorNombre: string
  proveedorWhatsapp: string
  proveedorEmail: string
  items: PedidoItem[]
  estado: 'borrador' | 'confirmado' | 'enviado'
  fecha: string
  enviadoPor?: string
  confirmadoAt?: string
  entregadoAt?: string
  ingresoStockAt?: string
  imeiFile?: string
}

export async function getPedidos(): Promise<Pedido[]> {
  const supabase = createAdminClient()
  const { data } = await supabase.from('flujo_config').select('key, value').like('key', 'pedido_%')
  if (!data) return []
  return data.map(r => JSON.parse(r.value) as Pedido).sort((a, b) => b.fecha.localeCompare(a.fecha))
}

export async function guardarPedido(pedido: Pedido) {
  const supabase = createAdminClient()
  const { error } = await supabase.from('flujo_config').upsert({
    key: `pedido_${pedido.id}`,
    value: JSON.stringify(pedido),
    updated_at: new Date().toISOString(),
  })
  if (error) return { error: error.message }
  revalidatePath('/compras')
  return { ok: true }
}

export async function actualizarEstadoPedido(pedidoId: string, estado: 'borrador' | 'confirmado' | 'enviado', enviadoPor?: string) {
  const supabase = createAdminClient()
  const { data } = await supabase.from('flujo_config').select('value').eq('key', `pedido_${pedidoId}`).single()
  if (!data) return { error: 'Pedido no encontrado' }
  const pedido = JSON.parse(data.value) as Pedido
  pedido.estado = estado
  if (enviadoPor) pedido.enviadoPor = enviadoPor
  if (estado === 'confirmado') pedido.confirmadoAt = new Date().toISOString()
  return guardarPedido(pedido)
}

export async function marcarEntregado(pedidoId: string) {
  const supabase = createAdminClient()
  const { data } = await supabase.from('flujo_config').select('value').eq('key', `pedido_${pedidoId}`).single()
  if (!data) return { error: 'Pedido no encontrado' }
  const pedido = JSON.parse(data.value) as Pedido
  pedido.entregadoAt = new Date().toISOString()
  return guardarPedido(pedido)
}

export async function marcarIngresoStock(pedidoId: string) {
  const supabase = createAdminClient()
  const { data } = await supabase.from('flujo_config').select('value').eq('key', `pedido_${pedidoId}`).single()
  if (!data) return { error: 'Pedido no encontrado' }
  const pedido = JSON.parse(data.value) as Pedido
  pedido.ingresoStockAt = new Date().toISOString()
  return guardarPedido(pedido)
}

export async function subirImeiPedido(pedidoId: string, imeiData: string) {
  const supabase = createAdminClient()
  const { data } = await supabase.from('flujo_config').select('value').eq('key', `pedido_${pedidoId}`).single()
  if (!data) return { error: 'Pedido no encontrado' }
  const pedido = JSON.parse(data.value) as Pedido
  pedido.imeiFile = imeiData
  return guardarPedido(pedido)
}

export async function eliminarPedido(pedidoId: string) {
  const supabase = createAdminClient()
  const { error } = await supabase.from('flujo_config').delete().eq('key', `pedido_${pedidoId}`)
  if (error) return { error: error.message }
  revalidatePath('/compras')
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Precios NEWSAN SA (para valorización de stock)
// ---------------------------------------------------------------------------

export async function getPreciosNewsan(): Promise<Record<string, number>> {
  const supabase = createAdminClient()
  const NEWSAN_ID = '7f1dc677-9e89-4131-a4e9-06ca4458c884'
  const { data: precios } = await supabase
    .from('compras_precios')
    .select('producto_id, precio')
    .eq('proveedor_id', NEWSAN_ID)
  if (!precios) return {}

  const prodIds = precios.map(p => p.producto_id)
  const { data: prods } = await supabase
    .from('compras_productos')
    .select('id, nombre')
    .in('id', prodIds)
  if (!prods) return {}

  const prodMap: Record<string, string> = {}
  prods.forEach((p: {id: string; nombre: string}) => { prodMap[p.id] = p.nombre.toLowerCase().trim() })

  const result: Record<string, number> = {}
  precios.forEach((p: {producto_id: string; precio: number}) => {
    const nombre = prodMap[p.producto_id]
    if (nombre) result[nombre] = Number(p.precio)
  })
  return result
}
