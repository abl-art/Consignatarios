interface AccesorioRow {
  producto: string
  ingresos: number
  disponibles: number
  ventas: number
  precioUnitario: number
  valuacion: number
}

interface Props {
  titulo: string
  subtitulo: string
  rows: AccesorioRow[]
}

function fmt(n: number): string {
  return new Intl.NumberFormat('es-AR').format(n)
}

function fmtMoney(n: number): string {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n)
}

export default function AccesoriosInventario({ titulo, subtitulo, rows }: Props) {
  const totalIngresos = rows.reduce((s, r) => s + r.ingresos, 0)
  const totalVentas = rows.reduce((s, r) => s + r.ventas, 0)
  const totalDisponibles = rows.reduce((s, r) => s + r.disponibles, 0)
  const totalValuacion = rows.reduce((s, r) => s + r.valuacion, 0)

  return (
    <div className="p-4 md:p-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">{titulo}</h1>
      <p className="text-sm text-gray-500 mb-6">{subtitulo}</p>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">Ingresos totales</p>
          <p className="text-2xl font-bold text-gray-900">{fmt(totalIngresos)}</p>
          <p className="text-xs text-gray-400">unidades recibidas</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">Ventas</p>
          <p className="text-2xl font-bold text-emerald-600">{fmt(totalVentas)}</p>
          <p className="text-xs text-gray-400">unidades vendidas</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">Disponibles</p>
          <p className="text-2xl font-bold text-blue-600">{fmt(totalDisponibles)}</p>
          <p className="text-xs text-gray-400">en stock</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">Valuacion total</p>
          <p className="text-2xl font-bold text-gray-900">{fmtMoney(totalValuacion)}</p>
          <p className="text-xs text-gray-400">stock disponible</p>
        </div>
      </div>

      {/* Tabla */}
      {rows.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-16 text-center">
          <p className="text-gray-400 text-sm">Sin productos en esta categoria. Cargalos desde Compras.</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-4 py-3 font-semibold text-gray-700">Producto</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-700">Ingresos</th>
                <th className="text-right px-4 py-3 font-semibold text-emerald-700">Ventas</th>
                <th className="text-right px-4 py-3 font-semibold text-blue-700">Disponibles</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-700">Precio unit.</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-700">Valuacion</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b border-gray-100 last:border-b-0 hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{r.producto}</td>
                  <td className="px-4 py-3 text-right text-gray-700">{fmt(r.ingresos)}</td>
                  <td className="px-4 py-3 text-right text-emerald-600 font-medium">{fmt(r.ventas)}</td>
                  <td className="px-4 py-3 text-right text-blue-600 font-medium">{fmt(r.disponibles)}</td>
                  <td className="px-4 py-3 text-right text-gray-700">{fmtMoney(r.precioUnitario)}</td>
                  <td className="px-4 py-3 text-right text-gray-900 font-semibold">{fmtMoney(r.valuacion)}</td>
                </tr>
              ))}
            </tbody>
            {rows.length > 1 && (
              <tfoot>
                <tr className="bg-gray-50 border-t border-gray-200">
                  <td className="px-4 py-3 font-bold text-gray-900">Total</td>
                  <td className="px-4 py-3 text-right font-bold text-gray-900">{fmt(totalIngresos)}</td>
                  <td className="px-4 py-3 text-right font-bold text-emerald-600">{fmt(totalVentas)}</td>
                  <td className="px-4 py-3 text-right font-bold text-blue-600">{fmt(totalDisponibles)}</td>
                  <td className="px-4 py-3 text-right text-gray-400">—</td>
                  <td className="px-4 py-3 text-right font-bold text-gray-900">{fmtMoney(totalValuacion)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  )
}
