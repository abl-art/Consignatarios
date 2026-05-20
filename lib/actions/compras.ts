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

/** Extrae clave de matching: marca-modelo-storage. Ej: "motorola-g06-128", "xiaomi-note14pro-256" */
function modelMatchKey(name: string): string {
  const lower = name.toLowerCase()
  const brand = lower.includes('samsung') ? 'samsung'
    : (lower.includes('motorola') || lower.includes('moto')) ? 'motorola'
    : (lower.includes('xiaomi') || lower.includes('redmi')) ? 'xiaomi'
    : 'other'
  let model = ''
  const noteMatch = lower.match(/note\s*(\d+)\s*(pro)?/i)
  if (noteMatch) {
    model = `note${noteMatch[1]}${noteMatch[2] || ''}`
  } else {
    const letterNumMatch = lower.match(/[gaets]\d{2,3}/i)
    if (letterNumMatch) {
      model = letterNumMatch[0].toLowerCase()
    } else {
      const cMatch = lower.match(/(\d{2,3}c)/i)
      if (cMatch) model = cMatch[1].toLowerCase()
    }
  }
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

  // Obtener ventas, stock de celulares y catálogo activo en paralelo
  const [ventasPorModelo, stockCelulares, catalogoActivo] = await Promise.all([
    fechaMasAntigua ? fetchVentasPorModeloDesde(fechaMasAntigua) : Promise.resolve({}),
    fetchStockCelularesPorModelo(),
    fetchModelosActivos(),
  ])

  // Registrar qué matchKeys ya están en el mapa de compras
  const keysConCompras = new Set<string>()
  for (const g of grouped.values()) {
    keysConCompras.add(modelMatchKey(g.modelo))
  }

  // Agregar modelos activos del catálogo que no tengan compras aún
  for (const cat of catalogoActivo) {
    const key = modelMatchKey(cat.name)
    if (!keysConCompras.has(key)) {
      keysConCompras.add(key)
      grouped.set(cat.name, {
        modelo: cat.name,
        compras: 0,
        precio: 0,
        valuacion: 0,
        proveedor: '',
        fechaRecepcion: '',
      })
    }
  }

  // Matchear ventas y stock con modelos
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

async function fetchModelosActivos(): Promise<{ name: string; model_code: string }[]> {
  const { getPool } = await import('@/lib/db-pool')
  const pool = getPool()
  if (!pool) return []

  const client = await pool.connect()
  try {
    const res = await client.query<{ name: string; model_code: string }>(
      `SELECT name, model_code FROM device_models WHERE active = true ORDER BY brand, name`
    )
    return res.rows
  } finally {
    client.release()
  }
}

async function fetchVentasPorModeloDesde(desde: string): Promise<Record<string, number>> {
  const { getPool } = await import('@/lib/db-pool')
  const pool = getPool()
  if (!pool) return {}

  const client = await pool.connect()
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
    client.release()
  }
}

async function fetchStockCelularesPorModelo(): Promise<Record<string, number>> {
  const { getPool } = await import('@/lib/db-pool')
  const pool = getPool()
  if (!pool) return {}

  const client = await pool.connect()
  try {
    const [dispRes, pendRes] = await Promise.all([
      // Disponibles por modelo
      client.query<{ modelo: string; qty: string }>(
        `SELECT COALESCE(dm.name, ii.model_code) AS modelo, COUNT(*)::text AS qty
         FROM inventory_items ii
         LEFT JOIN device_models dm ON dm.model_code = ii.model_code
         WHERE ii.status = 'available'
         GROUP BY 1`
      ),
      // Pendientes de asignar por product_name
      client.query<{ modelo: string; pendientes: string }>(
        `SELECT so.product_name AS modelo, COUNT(*)::text AS pendientes
         FROM store_orders so
         JOIN gocuotas_orders go ON go.order_id = so.gocuotas_order_id
         WHERE go.order_status = 'approved'
           AND go.order_discarded_at IS NULL
           AND NOT EXISTS (SELECT 1 FROM devices d WHERE d.order_id = go.order_id)
         GROUP BY 1`
      ),
    ])

    // Agrupar por matchKey: disponibles - pendientes
    const byKey = new Map<string, { name: string; qty: number }>()

    for (const r of dispRes.rows) {
      const key = modelMatchKey(r.modelo)
      const existing = byKey.get(key)
      if (existing) {
        existing.qty += Number(r.qty)
      } else {
        byKey.set(key, { name: r.modelo, qty: Number(r.qty) })
      }
    }

    for (const r of pendRes.rows) {
      const key = modelMatchKey(r.modelo)
      const existing = byKey.get(key)
      if (existing) {
        existing.qty -= Number(r.pendientes)
      } else {
        byKey.set(key, { name: r.modelo, qty: -Number(r.pendientes) })
      }
    }

    const result: Record<string, number> = {}
    for (const { name, qty } of byKey.values()) {
      result[name] = qty
    }
    return result
  } finally {
    client.release()
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

