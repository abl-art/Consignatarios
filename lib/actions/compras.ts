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
  categoria?: string
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
// Inventario por categoría (sumando items de pedidos recibidos)
// ---------------------------------------------------------------------------

export interface InventarioCategoria {
  modelo: string
  compras: number
  ventas: number
  disponible: number
  stockCelulares: number
  precioUnitario: number
  valuacion: number
  proveedor: string
  fechaRecepcion: string
}

/** Extrae clave de matching: marca-modelo-storage. Ej: "motorola-g06-128" */
function modelMatchKey(name: string): string {
  const lower = name.toLowerCase()
  const brand = lower.includes('samsung') ? 'samsung'
    : (lower.includes('motorola') || lower.includes('moto')) ? 'motorola'
    : lower.includes('xiaomi') ? 'xiaomi' : 'other'
  const modelMatch = lower.match(/[ga]\d{2,3}/i)
  const model = modelMatch ? modelMatch[0].toLowerCase() : ''
  const allNumbers = [...lower.matchAll(/(\d+)/g)].map(m => Number(m[1])).filter(n => n >= 32 && n <= 1024)
  const storage = allNumbers.length > 0 ? Math.max(...allNumbers).toString() : ''
  return `${brand}-${model}-${storage}`
}

export async function getInventarioByCategoria(categoria: string): Promise<InventarioCategoria[]> {
  const pedidos = await getPedidos()

  const items: { modelo: string; cantidad: number; precio: number; proveedor: string; fechaRecepcion: string }[] = []
  let fechaMasAntigua: string | null = null

  for (const p of pedidos) {
    if (!p.entregadoAt) continue
    if (p.categoria !== categoria) continue

    if (!fechaMasAntigua || p.entregadoAt < fechaMasAntigua) {
      fechaMasAntigua = p.entregadoAt
    }

    for (const item of p.items) {
      items.push({
        modelo: item.productoNombre,
        cantidad: item.cantidad,
        precio: item.precio,
        proveedor: p.proveedorNombre,
        fechaRecepcion: p.entregadoAt,
      })
    }
  }

  // Agrupar compras por modelo
  const grouped = new Map<string, { modelo: string; compras: number; precio: number; valuacion: number; proveedor: string; fechaRecepcion: string }>()
  for (const item of items) {
    const key = item.modelo
    const existing = grouped.get(key)
    if (existing) {
      existing.compras += item.cantidad
      existing.valuacion += item.precio * item.cantidad
      existing.precio = Math.round(existing.valuacion / existing.compras)
    } else {
      grouped.set(key, {
        modelo: item.modelo,
        compras: item.cantidad,
        precio: item.precio,
        valuacion: item.precio * item.cantidad,
        proveedor: item.proveedor,
        fechaRecepcion: item.fechaRecepcion,
      })
    }
  }

  // Obtener ventas desde GOcuotas y stock de celulares en paralelo
  const [ventasPorModelo, stockCelulares] = await Promise.all([
    fechaMasAntigua ? fetchVentasPorModeloDesde(fechaMasAntigua) : Promise.resolve({}),
    fetchStockCelularesPorModelo(),
  ])

  // Matchear ventas y stock con modelos de compras
  const result: InventarioCategoria[] = []
  for (const g of grouped.values()) {
    const matchKey = modelMatchKey(g.modelo)
    let ventas = 0
    for (const [ventaModelo, qty] of Object.entries(ventasPorModelo)) {
      if (modelMatchKey(ventaModelo) === matchKey) {
        ventas += Number(qty)
      }
    }
    let stock = 0
    for (const [stockModelo, qty] of Object.entries(stockCelulares)) {
      if (modelMatchKey(stockModelo) === matchKey) {
        stock += Number(qty)
      }
    }
    const disponible = g.compras - ventas
    result.push({
      modelo: g.modelo,
      compras: g.compras,
      ventas,
      disponible,
      stockCelulares: stock,
      precioUnitario: g.precio,
      valuacion: disponible * g.precio,
      proveedor: g.proveedor,
      fechaRecepcion: g.fechaRecepcion,
    })
  }

  return result.sort((a, b) => b.compras - a.compras)
}

async function fetchVentasPorModeloDesde(desde: string): Promise<Record<string, number>> {
  const { Client } = await import('pg')
  const url = process.env.GOCELULAR_DB_URL
  if (!url) return {}

  const client = new Client({ connectionString: url })
  await client.connect()
  try {
    const res = await client.query<{ modelo: string; ventas: string }>(
      `SELECT COALESCE(so.product_name, 'Desconocido') AS modelo, COUNT(*)::text AS ventas
       FROM gocuotas_orders o
       LEFT JOIN store_orders so ON so.id::text = o.store_order_id
       WHERE o.order_delivered_at IS NOT NULL
         AND o.order_discarded_at IS NULL
         AND o.client_id::text IN ('1', '2026134', '2461631', '5495277')
         AND o.order_delivered_at >= $1::date
       GROUP BY 1`,
      [desde.slice(0, 10)]
    )
    const result: Record<string, number> = {}
    for (const r of res.rows) {
      result[r.modelo] = Number(r.ventas)
    }
    return result
  } finally {
    await client.end()
  }
}

async function fetchStockCelularesPorModelo(): Promise<Record<string, number>> {
  const { Client } = await import('pg')
  const url = process.env.GOCELULAR_DB_URL
  if (!url) return {}

  const client = new Client({ connectionString: url })
  await client.connect()
  try {
    // 1. Disponibles por modelo
    const dispRes = await client.query<{ modelo: string; qty: string }>(
      `SELECT COALESCE(dm.name, ii.model_code) AS modelo, COUNT(*)::text AS qty
       FROM inventory_items ii
       LEFT JOIN device_models dm ON dm.model_code = ii.model_code
       WHERE ii.status = 'available'
       GROUP BY 1`
    )

    // 2. Pendientes de asignar (órdenes pagadas sin device/inventory asignado)
    const pendRes = await client.query<{ modelo: string; pendientes: string }>(
      `SELECT COALESCE(dm.name, ii.model_code) AS modelo, COUNT(*)::text AS pendientes
       FROM store_orders so
       JOIN gocuotas_orders go ON go.order_id = so.gocuotas_order_id
       LEFT JOIN inventory_items ii ON ii.model_code = (
         SELECT ii2.model_code FROM inventory_items ii2 WHERE ii2.status = 'available' LIMIT 1
       )
       LEFT JOIN device_models dm ON dm.model_code = ii.model_code
       WHERE so.status = 'paid'
         AND so.cancelled_at IS NULL
         AND go.order_discarded_at IS NULL
         AND NOT EXISTS (SELECT 1 FROM devices d WHERE d.order_id = go.order_id)
         AND NOT EXISTS (SELECT 1 FROM inventory_items i2 WHERE i2.assigned_to_order_id = go.order_id AND i2.status = 'assigned')
       GROUP BY 1`
    )

    // Build result: disponibles - pendientes matching by model name key
    const disponibles: Record<string, number> = {}
    for (const r of dispRes.rows) {
      disponibles[r.modelo] = Number(r.qty)
    }

    // Match pendientes to disponibles using product_name from store_orders
    const pendRes2 = await client.query<{ product_name: string; pendientes: string }>(
      `SELECT so.product_name, COUNT(*)::text AS pendientes
       FROM store_orders so
       JOIN gocuotas_orders go ON go.order_id = so.gocuotas_order_id
       WHERE so.status = 'paid'
         AND so.cancelled_at IS NULL
         AND go.order_discarded_at IS NULL
         AND NOT EXISTS (SELECT 1 FROM devices d WHERE d.order_id = go.order_id)
         AND NOT EXISTS (SELECT 1 FROM inventory_items i2 WHERE i2.assigned_to_order_id = go.order_id AND i2.status = 'assigned')
       GROUP BY 1`
    )

    // Use modelMatchKey to subtract pendientes from disponibles
    const matchKey = (name: string): string => {
      const lower = name.toLowerCase()
      const brand = lower.includes('samsung') ? 'samsung'
        : (lower.includes('motorola') || lower.includes('moto')) ? 'motorola'
        : lower.includes('xiaomi') ? 'xiaomi' : 'other'
      const modelMatch = lower.match(/[ga]\d{2,3}/i)
      const model = modelMatch ? modelMatch[0].toLowerCase() : ''
      const allNumbers = [...lower.matchAll(/(\d+)/g)].map(m => Number(m[1])).filter(n => n >= 32 && n <= 1024)
      const storage = allNumbers.length > 0 ? Math.max(...allNumbers).toString() : ''
      return `${brand}-${model}-${storage}`
    }

    // Build key → modelo name map from disponibles
    const keyToModelo = new Map<string, string>()
    for (const modelo of Object.keys(disponibles)) {
      keyToModelo.set(matchKey(modelo), modelo)
    }

    // Subtract pendientes
    for (const r of pendRes2.rows) {
      const key = matchKey(r.product_name)
      const modelo = keyToModelo.get(key)
      if (modelo) {
        disponibles[modelo] = Math.max(0, (disponibles[modelo] ?? 0) - Number(r.pendientes))
      }
    }

    return disponibles
  } finally {
    await client.end()
  }
}

// ---------------------------------------------------------------------------
// Mejor precio disponible por producto (menor precio entre todos los proveedores)
// ---------------------------------------------------------------------------

// Normaliza nombres de producto para matching flexible
// "Motorola Motorola Moto G06 64gb" -> "motorola moto g06 64gb"
// "Samsung Celular Samsung Galaxy A07 4/64 GB" -> "samsung galaxy a07 4/64 gb"
function normalizarNombreProducto(nombre: string): string {
  let n = nombre.toLowerCase().trim()
  // Quitar prefijo "celular"
  n = n.replace(/\bcelular\b/g, '')
  // Quitar duplicación de marca al inicio
  n = n.replace(/^(motorola|samsung|xiaomi|apple|honor|nubia)\s+\1/i, '$1')
  // Normalizar espacios
  n = n.replace(/\s+/g, ' ').trim()
  return n
}

export async function getMejorPrecio(): Promise<Record<string, number>> {
  const supabase = createAdminClient()
  const { data: precios } = await supabase
    .from('compras_precios')
    .select('producto_id, precio')
  if (!precios) return {}

  // Agrupar por producto, quedarse con el menor precio
  const mejorPorProducto: Record<string, number> = {}
  for (const p of precios) {
    const precio = Number(p.precio)
    if (!mejorPorProducto[p.producto_id] || precio < mejorPorProducto[p.producto_id]) {
      mejorPorProducto[p.producto_id] = precio
    }
  }

  const prodIds = Object.keys(mejorPorProducto)
  if (prodIds.length === 0) return {}

  const { data: prods } = await supabase
    .from('compras_productos')
    .select('id, nombre')
    .in('id', prodIds)
  if (!prods) return {}

  const result: Record<string, number> = {}
  for (const prod of prods) {
    const nombre = normalizarNombreProducto(prod.nombre)
    result[nombre] = mejorPorProducto[prod.id]
  }
  return result
}

