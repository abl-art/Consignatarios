import { getPool } from './db-pool'
import { calcularStockKit } from './stock-accesorios'

export interface KitSeguridad {
  sku: string
  nombre: string
}

// Kits de Seguridad definidos en GOcelular (store_products, SKU KS-*).
// Fuente de verdad para el catalogo y el gestor de pedidos de Compras.
export async function fetchKitsSeguridad(): Promise<KitSeguridad[]> {
  const pool = getPool()
  if (!pool) return []
  const res = await pool.query<{ sku: string; nombre: string }>(
    `SELECT sku, display_name AS nombre
     FROM store_products
     WHERE sku ILIKE 'KS-%'
       AND display_name NOT ILIKE '%E2E%'
     ORDER BY display_name`
  )
  return res.rows
}

export interface KitStockAndreani {
  sku: string
  stockTotal: number
  stockAndreani: number
}

// Stock de cada kit en el warehouse de Andreani: abastecimientos aceptados
// menos pedidos despachados (misma logica que fetchStockPorWarehouse).
export async function fetchKitsStockAndreani(): Promise<Record<string, KitStockAndreani>> {
  const pool = getPool()
  if (!pool) return {}

  const [kitsRes, abastRes, pedidoRes, pendAceptadoRes] = await Promise.all([
    pool.query<{ sku: string; stock: string }>(
      `SELECT sku, COALESCE(stock, 0)::text AS stock
       FROM store_products
       WHERE sku ILIKE 'KS-%' AND display_name NOT ILIKE '%E2E%'`
    ),
    pool.query<{ payload: { abastecimiento?: { lineas?: Array<{ articulo?: { codigo?: string }; cantidadPedida?: number }> } } }>(
      `SELECT payload FROM andreani_wh_transactions
       WHERE tipo = 'abastecimiento' AND estado = 'accepted'`
    ),
    pool.query<{ payload: { pedido?: { lineas?: Array<{ articulo?: { codigo?: string; cantidad?: number } }> } } }>(
      `SELECT payload FROM andreani_wh_transactions
       WHERE tipo = 'pedido' AND estado = 'accepted'`
    ),
    // ASN aceptado pero aún sin recepción física en Andreani
    pool.query<{ sku: string; pendiente: string }>(
      `SELECT sp.sku,
              SUM(ai.quantity - LEAST(ai.received_quantity, ai.quantity))::text AS pendiente
       FROM inventory_intake_addon_items ai
       JOIN store_products sp ON sp.id = ai.addon_product_id
       JOIN andreani_wh_transactions t ON t.id = ai.asn_transaction_id
       WHERE ai.quantity > ai.received_quantity
         AND t.tipo = 'abastecimiento' AND t.estado = 'accepted'
         AND sp.sku ILIKE 'KS-%'
       GROUP BY sp.sku`
    ),
  ])

  const kitSkus = new Set(kitsRes.rows.map((r) => r.sku))

  const ingresado: Record<string, number> = {}
  for (const r of abastRes.rows) {
    for (const l of r.payload?.abastecimiento?.lineas ?? []) {
      const code = l.articulo?.codigo
      if (code && kitSkus.has(code)) {
        ingresado[code] = (ingresado[code] ?? 0) + (l.cantidadPedida ?? 0)
      }
    }
  }
  const despachado: Record<string, number> = {}
  for (const r of pedidoRes.rows) {
    for (const l of r.payload?.pedido?.lineas ?? []) {
      const code = l.articulo?.codigo
      if (code && kitSkus.has(code)) {
        despachado[code] = (despachado[code] ?? 0) + (l.articulo?.cantidad ?? 1)
      }
    }
  }

  const pendientesAceptadas: Record<string, number> = {}
  for (const r of pendAceptadoRes.rows) {
    pendientesAceptadas[r.sku] = Number(r.pendiente)
  }

  const result: Record<string, KitStockAndreani> = {}
  for (const r of kitsRes.rows) {
    result[r.sku] = {
      sku: r.sku,
      stockTotal: Number(r.stock),
      stockAndreani: calcularStockKit({
        informadas: ingresado[r.sku] ?? 0,
        pendientesAceptadas: pendientesAceptadas[r.sku] ?? 0,
        despachadas: despachado[r.sku] ?? 0,
      }).whAndreani,
    }
  }
  return result
}
