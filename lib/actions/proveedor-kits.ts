'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

const VALID_TOKEN = 'kits2026go'

// Proveedor Mil200 SAS
const PROVEEDOR = {
  id: '96147464-4794-4ea3-9ace-f8978ecadb2f',
  nombre: 'Mil200 SAS',
  whatsapp: '3518004472',
  email: 'ezecanova@gmail.com',
}

// Precio de respaldo si el kit no tiene precio cargado en el catalogo
const KIT_PRECIO_DEFAULT = 7000
const KIT_PLAZO = '30, 60 y 90 días'

interface EntregaItem {
  productoId: string
  productoNombre: string
  productoCodigo: string
  cantidad: number
}

// Precios del catalogo (compras_precios) del proveedor Mil200 por producto
export async function getPreciosKitsMil200(): Promise<Record<string, number>> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('compras_precios')
    .select('producto_id, precio')
    .eq('proveedor_id', PROVEEDOR.id)
  const map: Record<string, number> = {}
  for (const r of data ?? []) map[r.producto_id] = Number(r.precio)
  return map
}

export async function registrarEntregaKits(token: string, items: EntregaItem[], excelBase64?: string) {
  if (token !== VALID_TOKEN) return { error: 'Token inválido' }
  if (items.length === 0 || items.every(i => i.cantidad <= 0)) return { error: 'Sin items' }

  const validItems = items.filter(i => i.cantidad > 0)
  const precios = await getPreciosKitsMil200()
  const now = new Date()
  const pedidoId = `NP-${now.getTime()}-${PROVEEDOR.id}`

  const pedido = {
    id: pedidoId,
    proveedorId: PROVEEDOR.id,
    proveedorNombre: PROVEEDOR.nombre,
    proveedorWhatsapp: PROVEEDOR.whatsapp,
    proveedorEmail: PROVEEDOR.email,
    items: validItems.map(i => ({
      productoId: i.productoId,
      productoNombre: i.productoNombre,
      productoCodigo: i.productoCodigo,
      proveedorId: PROVEEDOR.id,
      proveedorNombre: PROVEEDOR.nombre,
      proveedorWhatsapp: PROVEEDOR.whatsapp,
      proveedorEmail: PROVEEDOR.email,
      precio: precios[i.productoId] ?? KIT_PRECIO_DEFAULT,
      plazo: KIT_PLAZO,
      cantidad: i.cantidad,
    })),
    // Queda "en transito al WH de Andreani" hasta que se marque recibido
    // en el gestor de pedidos (entregadoAt)
    estado: 'enviado' as const,
    categoria: 'Kits de Seguridad',
    fecha: now.toLocaleDateString('es-AR'),
    confirmadoAt: now.toISOString(),
    // Excel de la entrega (base64): se descarga desde el gestor de pedidos
    // para informarlo a GOcelular / Andreani
    ...(excelBase64 ? { imeiFile: excelBase64 } : {}),
  }

  const supabase = createAdminClient()
  const { error } = await supabase.from('flujo_config').upsert({
    key: `pedido_${pedidoId}`,
    value: JSON.stringify(pedido),
    updated_at: now.toISOString(),
  })

  if (error) return { error: error.message }

  revalidatePath('/proveedor/kits')
  revalidatePath('/compras')
  revalidatePath('/inventario/kits-seguridad')
  return { ok: true, pedidoId }
}
