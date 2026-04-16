import { Client } from 'pg'

interface ModeloRow {
  brand: string
  name: string
  model_code: string
  default_price: number | null
  min_stock_alert: number | null
  disponibles: number
  pendientes: number
  real: number
}

async function loadStockPropio(): Promise<{ rows: ModeloRow[]; error: string | null }> {
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

    // 3. Órdenes activas que aún NO tienen un inventory_items con status='assigned' vinculado.
    //    Intentamos matchear el modelo por store_name (en GOcelular las ventas de ecommerce
    //    guardan el nombre del producto en store_name).
    const pendientesRes = await client.query<{ store_name: string; pendientes: string }>(
      `SELECT go.store_name, COUNT(*)::text AS pendientes
       FROM gocuotas_orders go
       WHERE go.order_discarded_at IS NULL
         AND NOT EXISTS (
           SELECT 1 FROM inventory_items ii
           WHERE ii.assigned_to_order_id = go.order_id AND ii.status = 'assigned'
         )
       GROUP BY go.store_name`
    )

    // Matchear store_name contra cada modelo: normalizamos ambos textos y comparamos.
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
    const pendPorModelo: Record<string, number> = {}
    for (const p of pendientesRes.rows) {
      const target = norm(p.store_name)
      for (const m of modelosRes.rows) {
        const mName = norm(m.name)
        if (target === mName || target.includes(mName) || mName.includes(target)) {
          pendPorModelo[m.model_code] = (pendPorModelo[m.model_code] ?? 0) + Number(p.pendientes)
          break
        }
      }
    }

    const rows: ModeloRow[] = modelosRes.rows.map((m) => {
      const disponibles = disponiblesMap.get(m.model_code) ?? 0
      const pendientes = pendPorModelo[m.model_code] ?? 0
      return {
        brand: m.brand,
        name: m.name,
        model_code: m.model_code,
        default_price: m.default_price,
        min_stock_alert: m.min_stock_alert,
        disponibles,
        pendientes,
        real: disponibles - pendientes,
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
  const { rows, error } = await loadStockPropio()

  const totalDisponibles = rows.reduce((s, r) => s + r.disponibles, 0)
  const totalPendientes = rows.reduce((s, r) => s + r.pendientes, 0)
  const totalReal = rows.reduce((s, r) => s + r.real, 0)

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
            * &quot;Pendientes de asignar&quot; cuenta órdenes activas en GOcelular cuyo IMEI aún no está vinculado.
            El match se hace por nombre de modelo en <code className="bg-gray-100 px-1 rounded">store_name</code>.
          </p>
        </>
      )}
    </div>
  )
}
