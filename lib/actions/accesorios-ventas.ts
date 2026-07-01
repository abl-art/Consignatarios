import { getPool } from '@/lib/db-pool'
import { createAdminClient } from '@/lib/supabase/admin'

// ─── Config types ────────────────────────────────────────────────────────────

export interface CategoriaConfig {
  /** Display name for the category (for Supabase filter) */
  categoria: string
  /** Unified product name shown in UI */
  nombreUnificado: string
  /** Lowercase variant names as stored in store_order_items.display_name */
  variants: string[]
  /** Keywords used to filter store_products by display_name */
  keywords: string[]
}

// ─── Config constants ─────────────────────────────────────────────────────────

export const SMARTWATCHES_CONFIG: CategoriaConfig = {
  categoria: 'smartwatches',
  nombreUnificado: 'Pulsera Inteligente Xiaomi 9 Active',
  variants: [
    'pulsera inteligente xiaomi 9 active',
    'xiaomi smart band 9 active',
    'xiaomi samrt band 9 active',
    'mi band 9 active',
    'smart band 9 active',
  ],
  keywords: ['pulsera', 'band', 'watch', 'smartwatch', 'reloj'],
}

export const PARLANTES_CONFIG: CategoriaConfig = {
  categoria: 'parlantes',
  nombreUnificado: 'Parlantes',
  variants: [
    'parlante xiaomi 2 bluetooth',
    'xiaomi speaker 2 bluetooth',
    'mi speaker 2 bluetooth',
    'parlante bluetooth mi compact speaker 2',
    'jbl go essential',
  ],
  keywords: ['speaker', 'parlante', 'bocina', 'altavoz', 'jbl'],
}

export const AURICULARES_CONFIG: CategoriaConfig = {
  categoria: 'auriculares',
  nombreUnificado: 'Auriculares Redmi Buds 6 Play',
  variants: [
    'auriculares redmi buds 6 play',
    'redmi buds 6 play',
  ],
  keywords: ['buds', 'auricular', 'earphone', 'headphone', 'earbuds'],
}

// ─── Return types ─────────────────────────────────────────────────────────────

export interface VentaDiaria {
  fecha: string   // 'YYYY-MM-DD'
  cantidad: number
  monto: number
}

export interface CierreMensual {
  periodo: string
  stock_final: number
  precio_unitario: number
  valuacion: number
}

export interface AccesorioKpis {
  stockDisponible: number
  precioUnitario: number
  valuacion: number
  ventasMes: number
  ventasSemana: number
  ventasAyer: number
}

export interface AccesorioData {
  kpis: AccesorioKpis
  ventasDiarias: VentaDiaria[]
  cierres: CierreMensual[]
  error: string | null
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function matchesKeywords(name: string, keywords: string[]): boolean {
  const lower = name.toLowerCase()
  return keywords.some(k => lower.includes(k))
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10)
}

// ─── Main fetch function ──────────────────────────────────────────────────────

export async function fetchAccesorioData(config: CategoriaConfig): Promise<AccesorioData> {
  const empty: AccesorioData = {
    kpis: { stockDisponible: 0, precioUnitario: 0, valuacion: 0, ventasMes: 0, ventasSemana: 0, ventasAyer: 0 },
    ventasDiarias: [],
    cierres: [],
    error: null,
  }

  const pool = getPool()
  if (!pool) return { ...empty, error: 'GOCELULAR_DB_URL no configurada' }

  const client = await pool.connect()
  try {
    // 1. Stock from store_products (is_addon=true, active, not E2E) filtered by keywords
    const stockRes = await client.query<{ display_name: string; stock: string; price: string }>(
      `SELECT display_name, COALESCE(stock, 0)::text AS stock, price
       FROM store_products
       WHERE is_addon = true AND status = 'active' AND display_name NOT ILIKE '%E2E%'`
    )
    const matchingProducts = stockRes.rows.filter(r => matchesKeywords(r.display_name, config.keywords))

    let stockDisponible = 0
    let precioUnitario = 0
    for (const r of matchingProducts) {
      stockDisponible += Number(r.stock)
      if (Number(r.price) > 0) precioUnitario = Number(r.price) / 100
    }
    const valuacion = stockDisponible * precioUnitario

    // 2. Ventas diarias from store_order_items JOIN store_orders JOIN gocuotas_orders
    const ventasRes = await client.query<{ fecha: string; cantidad: string; monto: string }>(
      `SELECT so.created_at::date::text AS fecha,
              COALESCE(SUM(soi.quantity), 0)::text AS cantidad,
              COALESCE(SUM(
                CASE WHEN go.total_order_amount > 5000000
                     THEN go.total_order_amount / 100.0
                     ELSE go.total_order_amount END
              ), 0)::text AS monto
       FROM store_order_items soi
       JOIN store_orders so ON so.id = soi.order_id
       JOIN gocuotas_orders go ON go.order_id = so.gocuotas_order_id
       WHERE go.order_status = 'approved'
         AND go.order_discarded_at IS NULL
         AND LOWER(soi.display_name) = ANY($1)
       GROUP BY 1
       ORDER BY 1`,
      [config.variants]
    )

    const ventasDiarias: VentaDiaria[] = ventasRes.rows.map(r => ({
      fecha: r.fecha,
      cantidad: Number(r.cantidad),
      monto: Number(r.monto),
    }))

    // 3. KPI calculations from ventasDiarias
    const now = new Date()
    const yesterday = toDateStr(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1))
    const sevenDaysAgo = toDateStr(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7))
    const firstOfMonth = toDateStr(new Date(now.getFullYear(), now.getMonth(), 1))

    let ventasAyer = 0
    let ventasSemana = 0
    let ventasMes = 0
    for (const v of ventasDiarias) {
      if (v.fecha === yesterday) ventasAyer += v.cantidad
      if (v.fecha >= sevenDaysAgo) ventasSemana += v.cantidad
      if (v.fecha >= firstOfMonth) ventasMes += v.cantidad
    }

    // 4. Cierres from Supabase stock_cierre_mensual
    let cierres: CierreMensual[] = []
    try {
      const admin = createAdminClient()
      const { data } = await admin
        .from('stock_cierre_mensual')
        .select('periodo, stock_final, precio_unitario, valuacion')
        .eq('categoria', config.categoria)
        .order('periodo', { ascending: false })
      if (data) {
        cierres = data.map(d => ({
          periodo: d.periodo as string,
          stock_final: Number(d.stock_final),
          precio_unitario: Number(d.precio_unitario),
          valuacion: Number(d.valuacion),
        }))
      }
    } catch {
      // Non-fatal: cierres unavailable
    }

    return {
      kpis: { stockDisponible, precioUnitario, valuacion, ventasMes, ventasSemana, ventasAyer },
      ventasDiarias,
      cierres,
      error: null,
    }
  } catch (e: unknown) {
    return { ...empty, error: e instanceof Error ? e.message : String(e) }
  } finally {
    client.release()
  }
}
