export const dynamic = 'force-dynamic'

import { getPool } from '@/lib/db-pool'
import { formatearMoneda } from '@/lib/utils'
import { getPedidos } from '@/lib/actions/compras'

// Variantes de nombre en store_order_items
const PARLANTE_NAMES = [
  'parlante xiaomi 2 bluetooth',
  'xiaomi speaker 2 bluetooth',
  'mi speaker 2 bluetooth',
  'parlante bluetooth mi compact speaker 2',
]

const NOMBRE_UNIFICADO = 'Parlante Xiaomi 2 Bluetooth'

const KEYWORDS = ['speaker', 'parlante', 'bocina', 'altavoz']

function esParlante(name: string): boolean {
  const lower = name.toLowerCase()
  return KEYWORDS.some(k => lower.includes(k))
}

interface Row {
  producto: string
  ingresos: number
  ventas: number
  disponibles: number
  precioUnitario: number
  valuacion: number
}

async function loadData(): Promise<{ rows: Row[]; error: string | null }> {
  const pool = getPool()
  if (!pool) return { rows: [], error: 'GOCELULAR_DB_URL no configurada' }

  const client = await pool.connect()
  try {

    // 1. Disponibles desde store_products (fuente de verdad)
    const stockRes = await client.query<{ display_name: string; stock: string; price: string }>(
      `SELECT display_name, COALESCE(stock, 0)::text AS stock, price
       FROM store_products
       WHERE is_addon = true AND status = 'active' AND display_name NOT ILIKE '%E2E%'`
    )
    const items = stockRes.rows.filter(r => esParlante(r.display_name))
    let disponibles = 0
    let precio = 0
    for (const r of items) {
      disponibles += Number(r.stock)
      if (Number(r.price) > 0) precio = Number(r.price) / 100
    }

    // 2. Ventas (órdenes aprobadas no descartadas)
    const ventasRes = await client.query<{ qty: string }>(
      `SELECT COALESCE(SUM(soi.quantity), 0)::text AS qty
       FROM store_order_items soi
       JOIN store_orders so ON so.id = soi.order_id
       JOIN gocuotas_orders go ON go.order_id = so.gocuotas_order_id
       WHERE go.order_status = 'approved'
         AND go.order_discarded_at IS NULL
         AND LOWER(soi.display_name) = ANY($1)`,
      [PARLANTE_NAMES]
    )
    const ventas = Number(ventasRes.rows[0].qty)

    // 3. Ingresos desde pedidos entregados (Supabase)
    const pedidos = await getPedidos()
    let ingresos = 0
    let precioCompra = precio
    for (const p of pedidos.filter(p => p.entregadoAt)) {
      for (const item of p.items) {
        const lower = item.productoNombre.toLowerCase()
        if (PARLANTE_NAMES.some(n => lower.includes(n) || n.includes(lower.trim()))) {
          ingresos += item.cantidad
          if (item.precio > 0) precioCompra = item.precio
        }
      }
    }

    return {
      rows: [{
        producto: NOMBRE_UNIFICADO,
        ingresos,
        ventas,
        disponibles,
        precioUnitario: precioCompra,
        valuacion: disponibles * precioCompra,
      }],
      error: null,
    }
  } catch (e: unknown) {
    return { rows: [], error: e instanceof Error ? e.message : String(e) }
  } finally {
    client.release()
  }
}

export default async function ParlantesPage() {
  const { rows, error } = await loadData()

  const totals = rows.reduce(
    (s, r) => ({ ingresos: s.ingresos + r.ingresos, ventas: s.ventas + r.ventas, disponibles: s.disponibles + r.disponibles, valuacion: s.valuacion + r.valuacion }),
    { ingresos: 0, ventas: 0, disponibles: 0, valuacion: 0 },
  )

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Parlantes</h1>
      <p className="text-sm text-gray-500 mb-6">
        Inventario de parlantes — ingresos desde pedidos, ventas y disponibles desde GOcelular.
      </p>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 text-sm text-red-700">
          No se pudo consultar GOcelular: {error}
        </div>
      )}

      {!error && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">Ingresos</p>
              <p className="text-2xl font-bold text-gray-900">{totals.ingresos}</p>
              <p className="text-xs text-gray-400">desde pedidos</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">Ventas</p>
              <p className="text-2xl font-bold text-emerald-600">{totals.ventas}</p>
              <p className="text-xs text-gray-400">unidades vendidas</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">Disponibles</p>
              <p className="text-2xl font-bold text-blue-600">{totals.disponibles}</p>
              <p className="text-xs text-gray-400">en inventario GOcelular</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">Valuacion</p>
              <p className="text-2xl font-bold text-gray-900">{formatearMoneda(totals.valuacion)}</p>
              <p className="text-xs text-gray-400">stock disponible</p>
            </div>
          </div>

          {rows.length === 0 ? (
            <div className="bg-white border border-gray-200 rounded-xl p-16 text-center">
              <p className="text-gray-400 text-sm">Sin parlantes en el inventario.</p>
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="text-left px-6 py-3 font-medium text-gray-600">Producto</th>
                    <th className="text-right px-6 py-3 font-medium text-gray-600">Ingresos</th>
                    <th className="text-right px-6 py-3 font-medium text-emerald-700">Ventas</th>
                    <th className="text-right px-6 py-3 font-medium text-blue-700">Disponibles</th>
                    <th className="text-right px-6 py-3 font-medium text-gray-600">Precio unit.</th>
                    <th className="text-right px-6 py-3 font-medium text-gray-600">Valuacion</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className="border-b border-gray-100 last:border-b-0 hover:bg-gray-50">
                      <td className="px-6 py-3 font-medium text-gray-900">{r.producto}</td>
                      <td className="px-6 py-3 text-right text-gray-700">{r.ingresos}</td>
                      <td className="px-6 py-3 text-right text-emerald-600 font-medium">{r.ventas}</td>
                      <td className="px-6 py-3 text-right text-blue-600 font-bold">{r.disponibles}</td>
                      <td className="px-6 py-3 text-right text-gray-600">{formatearMoneda(r.precioUnitario)}</td>
                      <td className="px-6 py-3 text-right text-gray-900 font-semibold">{formatearMoneda(r.valuacion)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
