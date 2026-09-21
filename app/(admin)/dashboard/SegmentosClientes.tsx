import type { MixSegmentos } from '@/lib/segmentos'

// Mix de segmentos A1–D4 (Estructura de Crédito GO) de los compradores de
// GOcelular, abierto por canal. Letra = límite en tickets promedio, número =
// antigüedad desde la activación. La tabla segmentos_clientes se recalcula a
// diario contra Databricks (cron sync-segmentos).

function pct(n: number, total: number): string {
  if (total === 0) return '—'
  return `${((n / total) * 100).toFixed(1)}%`
}

function Barra({ n, total, color }: { n: number; total: number; color: string }) {
  const w = total === 0 ? 0 : Math.max(1, Math.round((n / total) * 100))
  return (
    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden w-full">
      <div className={`h-full ${color}`} style={{ width: `${w}%` }} />
    </div>
  )
}

export default function SegmentosClientes({ mix }: { mix: MixSegmentos }) {
  if (mix.filas.length === 0) return null
  const fecha = mix.actualizadoAt ? new Date(mix.actualizadoAt).toLocaleDateString('es-AR') : null

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 mt-4">
      <div className="flex items-baseline justify-between mb-1">
        <h2 className="text-base font-semibold text-gray-900">Segmentos de clientes</h2>
        <span className="text-xs text-gray-400">
          {mix.totalClientes.toLocaleString('es-AR')} compradores{fecha ? ` · actualizado ${fecha}` : ''}
        </span>
      </div>
      <p className="text-xs text-gray-500 mb-3">
        Letra = límite (A alto → D bajo) · Número = antigüedad (1 = +12m → 4 = inactivo)
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="py-1.5 pr-2 text-left font-medium text-gray-500">Segmento</th>
              <th className="py-1.5 px-2 text-right font-medium text-gray-500">Venta propia</th>
              <th className="py-1.5 px-2 text-left font-medium text-gray-500 w-24"></th>
              <th className="py-1.5 px-2 text-right font-medium text-gray-500">Terceros</th>
              <th className="py-1.5 px-2 text-left font-medium text-gray-500 w-24"></th>
              <th className="py-1.5 pl-2 text-right font-medium text-gray-500">Total</th>
            </tr>
          </thead>
          <tbody>
            {mix.filas.map(f => (
              <tr key={f.segmento} className="border-b border-gray-50 last:border-0">
                <td className="py-1.5 pr-2 font-semibold text-gray-900">{f.segmento}</td>
                <td className="py-1.5 px-2 text-right text-gray-700 whitespace-nowrap">
                  {f.propia.toLocaleString('es-AR')} <span className="text-gray-400">({pct(f.propia, mix.totalPropia)})</span>
                </td>
                <td className="py-1.5 px-2"><Barra n={f.propia} total={mix.totalPropia} color="bg-gray-900" /></td>
                <td className="py-1.5 px-2 text-right text-gray-700 whitespace-nowrap">
                  {f.terceros.toLocaleString('es-AR')} <span className="text-gray-400">({pct(f.terceros, mix.totalTerceros)})</span>
                </td>
                <td className="py-1.5 px-2"><Barra n={f.terceros} total={mix.totalTerceros} color="bg-blue-600" /></td>
                <td className="py-1.5 pl-2 text-right font-medium text-gray-900 whitespace-nowrap">
                  {f.total.toLocaleString('es-AR')} <span className="font-normal text-gray-400">({pct(f.total, mix.totalClientes)})</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-gray-400 mt-2">
        % sobre el total de cada canal. Un cliente que compró en ambos canales cuenta en los dos; en Total, una sola vez.
      </p>
    </div>
  )
}
