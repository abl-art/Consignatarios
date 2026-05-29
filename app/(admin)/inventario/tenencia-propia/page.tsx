export const dynamic = 'force-dynamic'

import { getPool } from '@/lib/db-pool'
import { getMejorPrecio } from '@/lib/actions/compras'
import { buscarPrecio } from '@/lib/utils'
import { getTenenciaModelosOcultos } from '@/lib/actions/tenencia-ocultos'
import TenenciaTable from './TenenciaTable'

interface ModeloRow {
  brand: string
  name: string
  model_code: string
  default_price: number | null
  min_stock_alert: number | null
  disponibles: number
  pendientes: number
  real: number
  precio_unit: number
  valor: number
}

interface UnmatchedRow {
  product_name: string
  pendientes: number
  key: string
}

async function loadStockPropio(preciosNewsan: Record<string, number>): Promise<{ rows: ModeloRow[]; unmatched: UnmatchedRow[]; error: string | null }> {
  const pool = getPool()
  if (!pool) return { rows: [], unmatched: [], error: 'GOCELULAR_DB_URL no configurada' }

  const client = await pool.connect()
  try {
    const disponiblesRes = await client.query<{ model_code: string; qty: string }>(
      `SELECT model_code, COUNT(*)::text AS qty
       FROM inventory_items
       WHERE status = 'available'
       GROUP BY model_code`
    )
    const disponiblesMap = new Map<string, number>()
    for (const r of disponiblesRes.rows) disponiblesMap.set(r.model_code, Number(r.qty))

    const modelosRes = await client.query<{
      brand: string
      name: string
      model_code: string
      default_price: number | null
      min_stock_alert: number | null
    }>(
      `SELECT brand, name, model_code, default_price, min_stock_alert
       FROM device_models
       WHERE active = true
       ORDER BY brand, name`
    )

    const pendientesRes = await client.query<{ product_name: string; pendientes: string }>(
      `SELECT so.product_name, COUNT(*)::text AS pendientes
       FROM store_orders so
       JOIN gocuotas_orders go ON go.order_id = so.gocuotas_order_id
       WHERE go.order_status = 'approved'
         AND go.order_discarded_at IS NULL
         AND NOT EXISTS (SELECT 1 FROM devices d WHERE d.order_id = go.order_id)
       GROUP BY so.product_name
       ORDER BY pendientes DESC`
    )

    const matchKey = (name: string): string => {
      const lower = name.toLowerCase()
      const brand = lower.includes('samsung') ? 'samsung'
        : (lower.includes('motorola') || lower.includes('moto')) ? 'motorola'
        : (lower.includes('xiaomi') || lower.includes('redmi') || lower.includes('poco')) ? 'xiaomi'
        : lower.includes('tcl') ? 'tcl'
        : 'other'
      let model = ''
      const noteMatch = lower.match(/note\s*(\d+)\s*(pro\s*\+?|pro\s*max)?/i)
      if (noteMatch) {
        model = `note${noteMatch[1]}${(noteMatch[2] || '').replace(/\s+/g, '')}`
      } else {
        const letterNumMatch = lower.match(/[gaet]\d{2,3}/i)
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

    const catalogKeys = modelosRes.rows.map(m => ({ model_code: m.model_code, key: matchKey(m.name) }))

    const pendPorModelo: Record<string, number> = {}
    const unmatched: UnmatchedRow[] = []
    for (const p of pendientesRes.rows) {
      const pKey = matchKey(p.product_name)
      const match = catalogKeys.find(c => c.key === pKey)
      if (match) {
        pendPorModelo[match.model_code] = (pendPorModelo[match.model_code] ?? 0) + Number(p.pendientes)
      } else {
        unmatched.push({ product_name: p.product_name, pendientes: Number(p.pendientes), key: pKey })
      }
    }

    const rows: ModeloRow[] = modelosRes.rows.map((m) => {
      const disponibles = disponiblesMap.get(m.model_code) ?? 0
      const pendientes = pendPorModelo[m.model_code] ?? 0
      const real = disponibles - pendientes
      const precioNewsan = buscarPrecio(preciosNewsan, m.name)
      return {
        brand: m.brand,
        name: m.name,
        model_code: m.model_code,
        default_price: m.default_price,
        min_stock_alert: m.min_stock_alert,
        disponibles,
        pendientes,
        real,
        precio_unit: precioNewsan,
        valor: real * precioNewsan,
      }
    })

    return { rows, unmatched, error: null }
  } catch (e: unknown) {
    return { rows: [], unmatched: [], error: e instanceof Error ? e.message : String(e) }
  } finally {
    client.release()
  }
}

export default async function TenenciaPropiaPage() {
  const [preciosNewsan, modelosOcultos] = await Promise.all([
    getMejorPrecio(),
    getTenenciaModelosOcultos(),
  ])
  const { rows, unmatched, error } = await loadStockPropio(preciosNewsan)

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Tenencia propia — stock GOcelular</h1>
      <p className="text-sm text-gray-500 mb-6">
        Resumen por modelo del inventario propio de GOcelular, con ordenes pendientes de asignacion.
      </p>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 text-sm text-red-700">
          No se pudo consultar GOcelular: {error}
        </div>
      )}

      {!error && (
        <TenenciaTable rows={rows} unmatched={unmatched} modelosOcultos={modelosOcultos} />
      )}
    </div>
  )
}
