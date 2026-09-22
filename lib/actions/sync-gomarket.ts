'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getPool } from '@/lib/db-pool'
import { planSyncGomarket, nombreSkuGomarket, type SkuGomarket, type ProductoGestorGomarket } from '@/lib/gomarket-catalogo'

// Sincroniza el catálogo de GOmarket (commerce_skus/commerce_products de la
// réplica) con compras_productos: crea los SKUs nuevos como plataforma
// 'gomarket' con su categoría de GOmarket, actualiza nombres/categorías y
// oculta los dados de baja. Igual que syncKitsGocelular: si la DB externa no
// responde, no toca nada. El alta se hace UNA vez, en el admin de GOmarket.
export async function syncProductosGomarket() {
  let catalogo: SkuGomarket[]
  try {
    catalogo = await fetchCatalogoGomarket()
  } catch {
    return
  }
  if (catalogo.length === 0) return

  const supabase = createAdminClient()
  const { data: existentes } = await supabase
    .from('compras_productos')
    .select('id, codigo, nombre, categoria, oculto')
    .eq('plataforma', 'gomarket')

  const plan = planSyncGomarket(catalogo, (existentes ?? []) as ProductoGestorGomarket[])

  if (plan.nuevos.length > 0) {
    await supabase.from('compras_productos').insert(plan.nuevos)
  }
  for (const u of plan.actualizar) {
    await supabase.from('compras_productos')
      .update({ nombre: u.nombre, categoria: u.categoria, oculto: u.oculto })
      .eq('id', u.id)
  }
  if (plan.ocultar.length > 0) {
    await supabase.from('compras_productos').update({ oculto: true }).in('id', plan.ocultar)
  }
}

async function fetchCatalogoGomarket(): Promise<SkuGomarket[]> {
  const pool = getPool()
  if (!pool) return []
  const client = await pool.connect()
  try {
    const res = await client.query<{ sku: string; product_name: string; variant_name: string | null; categoria: string | null; is_active: boolean }>(
      `SELECT cs.sku, cp.name AS product_name, cs.variant_name, cc.name AS categoria, cs.is_active
       FROM commerce_skus cs
       JOIN commerce_products cp ON cp.id = cs.product_id
       LEFT JOIN commerce_categories cc ON cc.id = cp.category_id
       ORDER BY cp.name, cs.variant_name`
    )
    return res.rows.map(r => ({
      sku: r.sku,
      nombre: nombreSkuGomarket(r.product_name, r.variant_name),
      categoria: r.categoria,
      activo: r.is_active,
    }))
  } finally {
    client.release()
  }
}

export interface ProductoGomarketSinSku {
  nombre: string
  categoria: string | null
}

// Productos creados en GOmarket que todavía NO tienen ningún SKU cargado: no
// se pueden sincronizar ni comprar (todo el circuito identifica por SKU).
// Se listan en /compras/modelos para que el faltante sea visible.
export async function getProductosGomarketSinSku(): Promise<ProductoGomarketSinSku[]> {
  const pool = getPool()
  if (!pool) return []
  const client = await pool.connect()
  try {
    const res = await client.query<{ nombre: string; categoria: string | null }>(
      `SELECT cp.name AS nombre, cc.name AS categoria
       FROM commerce_products cp
       LEFT JOIN commerce_categories cc ON cc.id = cp.category_id
       WHERE NOT EXISTS (SELECT 1 FROM commerce_skus cs WHERE cs.product_id = cp.id)
       ORDER BY cp.name`
    )
    return res.rows
  } catch {
    return []
  } finally {
    client.release()
  }
}

// Categorías activas de GOmarket (para el selector del form de Modelos cuando
// el producto es plataforma gomarket). Falla silenciosa → lista vacía.
export async function getCategoriasGomarket(): Promise<string[]> {
  const pool = getPool()
  if (!pool) return []
  const client = await pool.connect()
  try {
    const res = await client.query<{ name: string }>(
      `SELECT name FROM commerce_categories WHERE is_active = true ORDER BY sort_order, name`
    )
    return res.rows.map(r => r.name)
  } catch {
    return []
  } finally {
    client.release()
  }
}
