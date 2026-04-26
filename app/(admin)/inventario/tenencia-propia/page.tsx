import { Client } from 'pg'
import { getMejorPrecio } from '@/lib/actions/compras'
import { formatearMoneda, buscarPrecio } from '@/lib/utils'

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

async function loadStockPropio(preciosNewsan: Record<string, number>): Promise<{ rows: ModeloRow[]; error: string | null }> {
  const url = process.env.GOCELULAR_DB_URL
  if (!url) return { rows: [], error: 'GOCELULAR_DB_URL no configurada' }

  const client = new Client({ connectionString: url })
  try {
    await client.connect()

    // 1. Disponibles por modelo
    const disponiblesRes = await client.query<{ model_code: string; qty: string }>(
      `SELECT model_code, COUNT(*)::text AS qty
       FROM inventory_items
       WHERE status = 'available'
       GROUP BY model_code`
    )
    const disponiblesMap = new Map<string, number>()
    for (const r of disponiblesRes.rows) disponiblesMap.set(r.model_code, Number(r.qty))

    // 2. Catálogo activo
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

    // 3. Pendientes de asignar: store_orders pagadas que aún no tienen device ni
    //    inventory_items vinculado. Agrupamos por product_name (nombre del producto
    //    legible) y mapeamos a nuestros modelos del catálogo.
    const pendientesRes = await client.query<{ product_name: string; pendientes: string }>(
      `SELECT so.product_name, COUNT(*)::text AS pendientes
       FROM store_orders so
       JOIN gocuotas_orders go ON go.order_id = so.gocuotas_order_id
       WHERE so.status = 'paid'
         AND so.cancelled_at IS NULL
         AND go.order_discarded_at IS NULL
         AND NOT EXISTS (SELECT 1 FROM devices d WHERE d.order_id = go.order_id)
         AND NOT EXISTS (
           SELECT 1 FROM inventory_items ii
           WHERE ii.assigned_to_order_id = go.order_id AND ii.status = 'assigned'
         )
       GROUP BY so.product_name
       ORDER BY pendientes DESC`
    )

    // Match inteligente: extraer marca + número de modelo + storage de cada nombre.
    // Ej: "Motorola Moto G06 4/128GB" → "motorola-g06-128"
    //     "Motorola Moto G06 128GB"   → "motorola-g06-128" → MATCH
    //     "Motorola Moto G56 5G 256/8GB" → "motorola-g56-256"
    const matchKey = (name: string): string => {
      const lower = name.toLowerCase()
      const brand = lower.includes('samsung') ? 'samsung'
        : (lower.includes('motorola') || lower.includes('moto')) ? 'motorola' : 'other'
      const modelMatch = lower.match(/[ga]\d{2,3}/i)
      const model = modelMatch ? modelMatch[0].toLowerCase() : ''
      // Extraer todos los números que podrían ser storage (>= 32)
      // Captura: "128GB", "4/128GB", "256/8GB", "256GB"
      const allNumbers = [...lower.matchAll(/(\d+)/g)].map(m => Number(m[1])).filter(n => n >= 32 && n <= 1024)
      const storage = allNumbers.length > 0 ? Math.max(...allNumbers).toString() : ''
      return `${brand}-${model}-${storage}`
    }

    const pendPorModelo: Record<string, number> = {}
    for (const p of pendientesRes.rows) {
      const pKey = matchKey(p.product_name)
      for (const m of modelosRes.rows) {
        if (matchKey(m.name) === pKey) {
          pendPorModelo[m.model_code] = (pendPorModelo[m.model_code] ?? 0) + Number(p.pendientes)
          break
        }
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

    return { rows, error: null }
  } catch (e: unknown) {
    return { rows: [], error: e instanceof Error ? e.message : String(e) }
  } finally {
    await client.end().catch(() => {})
  }
}

export default async function TenenciaPropiaPage() {
  const preciosNewsan = await getMejorPrecio()
  const { rows, error } = await loadStockPropio(preciosNewsan)

  const totalDisponibles = rows.reduce((s, r) => s + r.disponibles, 0)
  const totalPendientes = rows.reduce((s, r) => s + r.pendientes, 0)
  const totalReal = rows.reduce((s, r) => s + r.real, 0)
  const totalValor = rows.reduce((s, r) => s + r.valor, 0)

  function rowClasses(r: ModeloRow): { bg: string; label: string | null } {
    if (r.min_stock_alert !== null && r.real < r.min_stock_alert) {
      return { bg: 'bg-red-50', label: 'REPONER' }
    }
    if (r.real < 0) return { bg: 'bg-amber-50', label: 'SOBREVENTA' }
    return { bg: '', label: null }
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Tenencia propia — stock GOcelular</h1>
      <p className="text-sm text-gray-500 mb-6">
        Resumen por modelo del inventario propio de GOcelular, con órdenes pendientes de asignación.
        Útil para planificar los pedidos semanales al proveedor.
      </p>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 text-sm text-red-700">
          No se pudo consultar GOcelular: {error}
        </div>
      )}

      {!error && (
        <>
          <div className="bg-magenta-50 border border-magenta-200 rounded-xl p-4 mb-6 flex flex-wrap gap-6 text-sm">
            <div>
              <p className="text-xs text-gray-500">Modelos activos</p>
              <p className="font-bold text-gray-900">{rows.length}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Disponibles</p>
              <p className="font-bold text-green-700">{totalDisponibles}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Pendientes de asignar</p>
              <p className="font-bold text-amber-700">{totalPendientes}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Disponibilidad real</p>
              <p className={`font-bold ${totalReal < 0 ? 'text-red-700' : 'text-magenta-700'}`}>{totalReal}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Valor stock</p>
              <p className="font-bold text-green-700">{formatearMoneda(totalValor)}</p>
            </div>
          </div>

          {rows.length === 0 ? (
            <div className="bg-white border border-gray-200 rounded-xl p-12 text-center text-gray-400 text-sm">
              Sin modelos activos en GOcelular.
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-6 py-3 font-medium text-gray-600">Marca</th>
                    <th className="text-left px-6 py-3 font-medium text-gray-600">Modelo</th>
                    <th className="text-right px-6 py-3 font-medium text-gray-600">Disponibles</th>
                    <th className="text-right px-6 py-3 font-medium text-gray-600">Pend. asignar</th>
                    <th className="text-right px-6 py-3 font-medium text-gray-600">Disp. real</th>
                    <th className="text-right px-6 py-3 font-medium text-gray-600">Precio unit.</th>
                    <th className="text-right px-6 py-3 font-medium text-gray-600">Valor</th>
                    <th className="text-right px-6 py-3 font-medium text-gray-600">Mínimo</th>
                    <th className="text-left px-6 py-3 font-medium text-gray-600">Alerta</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.map((r) => {
                    const cls = rowClasses(r)
                    return (
                      <tr key={r.model_code} className={`${cls.bg} hover:bg-gray-50`}>
                        <td className="px-6 py-3 font-medium text-gray-900">{r.brand}</td>
                        <td className="px-6 py-3 text-gray-700">{r.name}</td>
                        <td className="px-6 py-3 text-right font-semibold text-green-700">{r.disponibles}</td>
                        <td className="px-6 py-3 text-right text-amber-700">{r.pendientes}</td>
                        <td className={`px-6 py-3 text-right font-bold ${r.real < 0 ? 'text-red-700' : 'text-gray-900'}`}>
                          {r.real}
                        </td>
                        <td className="px-6 py-3 text-right text-gray-600">
                          {r.precio_unit > 0 ? formatearMoneda(r.precio_unit) : '—'}
                        </td>
                        <td className="px-6 py-3 text-right text-green-700 font-medium">
                          {r.valor > 0 ? formatearMoneda(r.valor) : '—'}
                        </td>
                        <td className="px-6 py-3 text-right text-gray-500">{r.min_stock_alert ?? '—'}</td>
                        <td className="px-6 py-3">
                          {cls.label && (
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${
                              cls.label === 'REPONER' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                            }`}>
                              {cls.label}
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          <p className="text-xs text-gray-400 mt-3">
            * &quot;Pendientes de asignar&quot; cuenta órdenes pagadas en GOcelular cuyo IMEI aún no fue vinculado.
            El match se hace por <code className="bg-gray-100 px-1 rounded">product_name</code> de store_orders contra el catálogo de modelos.
          </p>
        </>
      )}
    </div>
  )
}
