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

interface UnmatchedRow {
  product_name: string
  pendientes: number
  key: string
}

async function loadStockPropio(preciosNewsan: Record<string, number>): Promise<{ rows: ModeloRow[]; unmatched: UnmatchedRow[]; error: string | null }> {
  const url = process.env.GOCELULAR_DB_URL
  if (!url) return { rows: [], unmatched: [], error: 'GOCELULAR_DB_URL no configurada' }

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

    // 3. Pendientes de asignar: órdenes aprobadas en gocuotas_orders sin device asignado.
    //    Usamos go.order_status y go.order_discarded_at como fuente de verdad
    //    (no store_orders.cancelled_at que es un estado interno de la tienda).
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

    // Match inteligente: extraer marca + modelo + storage de cada nombre.
    // Ej: "Motorola Moto G06 4/128GB"            → "motorola-g06-128"
    //     "Samsung Galaxy A17 128GB"              → "samsung-a17-128"
    //     "Xiaomi Redmi Note 14 Pro 256/8GB"      → "xiaomi-note14pro-256"
    //     "Xiaomi Redmi 14C 256/4 GB"             → "xiaomi-14c-256"
    const matchKey = (name: string): string => {
      const lower = name.toLowerCase()
      const brand = lower.includes('samsung') ? 'samsung'
        : (lower.includes('motorola') || lower.includes('moto')) ? 'motorola'
        : (lower.includes('xiaomi') || lower.includes('redmi') || lower.includes('poco')) ? 'xiaomi'
        : lower.includes('tcl') ? 'tcl'
        : 'other'
      // Intentar extraer modelo: G06, A17, Note 14 Pro, 14C, E14, etc.
      let model = ''
      const noteMatch = lower.match(/note\s*(\d+)\s*(pro\s*\+?|pro\s*max)?/i)
      if (noteMatch) {
        model = `note${noteMatch[1]}${(noteMatch[2] || '').replace(/\s+/g, '')}`
      } else {
        // e.g. G06, G56, A17, A06, E14
        const letterNumMatch = lower.match(/[gaet]\d{2,3}/i)
        if (letterNumMatch) {
          model = letterNumMatch[0].toLowerCase()
        } else {
          // e.g. 14C, 128C
          const cMatch = lower.match(/(\d{2,3}c)/i)
          if (cMatch) model = cMatch[1].toLowerCase()
        }
      }
      // Extraer storage: el número más alto entre 32 y 1024 (ignorar RAM que es bajo)
      const allNumbers = [...lower.matchAll(/(\d+)/g)].map(m => Number(m[1])).filter(n => n >= 32 && n <= 1024)
      const storage = allNumbers.length > 0 ? Math.max(...allNumbers).toString() : ''
      return `${brand}-${model}-${storage}`
    }

    // Pre-compute catalog keys para matching
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
    await client.end().catch(() => {})
  }
}

export default async function TenenciaPropiaPage() {
  const preciosNewsan = await getMejorPrecio()
  const { rows, unmatched, error } = await loadStockPropio(preciosNewsan)

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
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
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
          <div className="bg-magenta-50 border border-magenta-200 rounded-xl p-4 mb-6 flex flex-wrap gap-3 md:gap-6 text-sm">
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
            <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
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

          {unmatched.length > 0 && (
            <div className="mt-6 bg-amber-50 border border-amber-200 rounded-xl p-4">
              <h2 className="text-sm font-semibold text-amber-800 mb-2">
                Pendientes sin match ({unmatched.reduce((s, u) => s + u.pendientes, 0)} órdenes no contabilizadas)
              </h2>
              <p className="text-xs text-amber-600 mb-3">
                Estos product_name de store_orders no pudieron mapearse a ningún modelo del catálogo. Sus pendientes no se están sumando.
              </p>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-amber-200">
                    <th className="text-left py-1 px-2 text-amber-700">product_name en store_orders</th>
                    <th className="text-right py-1 px-2 text-amber-700">Pendientes</th>
                    <th className="text-left py-1 px-2 text-amber-700">Clave generada</th>
                  </tr>
                </thead>
                <tbody>
                  {unmatched.map((u) => (
                    <tr key={u.product_name} className="border-b border-amber-100">
                      <td className="py-1 px-2 text-gray-800 font-mono">{u.product_name}</td>
                      <td className="py-1 px-2 text-right font-semibold text-amber-800">{u.pendientes}</td>
                      <td className="py-1 px-2 text-gray-500 font-mono">{u.key}</td>
                    </tr>
                  ))}
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
