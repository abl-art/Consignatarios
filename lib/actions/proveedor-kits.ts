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

const KIT_PRECIO = 7000
const KIT_PLAZO = '30, 60 y 90 días'

interface EntregaItem {
  productoId: string
  productoNombre: string
  productoCodigo: string
  cantidad: number
}

export async function registrarEntregaKits(token: string, items: EntregaItem[]) {
  if (token !== VALID_TOKEN) return { error: 'Token inválido' }
  if (items.length === 0 || items.every(i => i.cantidad <= 0)) return { error: 'Sin items' }

  const validItems = items.filter(i => i.cantidad > 0)
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
      precio: KIT_PRECIO,
      plazo: KIT_PLAZO,
      cantidad: i.cantidad,
    })),
    estado: 'enviado' as const,
    categoria: 'Kits de Seguridad',
    fecha: now.toLocaleDateString('es-AR'),
    confirmadoAt: now.toISOString(),
    entregadoAt: now.toISOString(),
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
