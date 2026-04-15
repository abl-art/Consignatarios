import { createClient } from '@/lib/supabase/server'
import { formatearMoneda } from '@/lib/utils'
import type { Consignatario, Venta, Diferencia } from '@/lib/types'

export default async function ReportesPage() {
  const supabase = createClient()

  const [
    { data: rawConsignatarios },
    { data: rawVentas },
    { data: rawDiferencias },
    { data: rawDispositivos },
  ] = await Promise.all([
    supabase
      .from('consignatarios')
      .select('*')
      .order('nombre')
      .returns<Consignatario[]>(),
    supabase
      .from('ventas')
      .select('*')
      .returns<Venta[]>(),
    supabase
      .from('diferencias')
      .select('*, auditorias(consignatario_id)')
      .eq('estado', 'pendiente')
      .returns<(Diferencia & { auditorias: { consignatario_id: string } })[]>(),
    supabase
      .from('dispositivos')
      .select('consignatario_id, estado'),
  ])

  const consignatarios = rawConsignatarios ?? []
  const ventas = rawVentas ?? []
  const diferencias = rawDiferencias ?? []
  const dispositivos = rawDispositivos ?? []

  // ── Section 1: Comisiones por consignatario y mes ──────────────────────────

  // Build nested map: comisionesMap[consignatario_id][YYYY-MM] = sum of comision_monto
  const comisionesMap: Record<string, Record<string, number>> = {}

  for (const venta of ventas) {
    const { consignatario_id, fecha_venta, comision_monto } = venta
    const month = fecha_venta.slice(0, 7) // YYYY-MM
    if (!comisionesMap[consignatario_id]) {
      comisionesMap[consignatario_id] = {}
    }
    comisionesMap[consignatario_id][month] =
      (comisionesMap[consignatario_id][month] ?? 0) + (comision_monto ?? 0)
  }

  // Extract unique months, sort ascending
  const allMonths = Array.from(
    new Set(ventas.map((v) => v.fecha_venta.slice(0, 7))),
  ).sort()

  // ── Section 2: Stock por consignatario ────────────────────────────────────

  const stockMap: Record<string, { asignados: number; vendidos: number }> = {}

  for (const disp of dispositivos) {
    const { consignatario_id, estado } = disp as { consignatario_id: string | null; estado: string }
    if (!consignatario_id) continue
    if (!stockMap[consignatario_id]) {
      stockMap[consignatario_id] = { asignados: 0, vendidos: 0 }
    }
    if (estado === 'asignado') stockMap[consignatario_id].asignados += 1
    if (estado === 'vendido') stockMap[consignatario_id].vendidos += 1
  }

  // ── Section 3: Diferencias pendientes por consignatario ──────────────────

  const difMap: Record<string, { count: number; total: number }> = {}

  for (const dif of diferencias) {
    const consignatario_id = dif.auditorias?.consignatario_id
    if (!consignatario_id) continue
    if (!difMap[consignatario_id]) {
      difMap[consignatario_id] = { count: 0, total: 0 }
    }
    difMap[consignatario_id].count += 1
    difMap[consignatario_id].total += dif.monto_deuda ?? 0
  }

  // Helper: format YYYY-MM as "MMM YY" label
  function formatMonth(ym: string): string {
    const [year, month] = ym.split('-')
    const date = new Date(Number(year), Number(month) - 1, 1)
    return date.toLocaleDateString('es-AR', { month: 'short', year: '2-digit' })
  }

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Reportes</h1>
        <p className="text-sm text-gray-500">Resumen de comisiones, stock y diferencias por consignatario</p>
      </div>

      {/* ── Section 1: Comisiones ─────────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800">Comisiones por consignatario y mes</h2>
          <p className="text-xs text-gray-400 mt-0.5">Suma de comision_monto agrupada por mes</p>
        </div>

        {ventas.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <p className="text-sm text-gray-400">
              Sin ventas registradas. Las comisiones se calcularán al sincronizar ventas.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide sticky left-0 bg-gray-50 min-w-[160px]">
                    Consignatario
                  </th>
                  {allMonths.map((m) => (
                    <th
                      key={m}
                      className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap"
                    >
                      {formatMonth(m)}
                    </th>
                  ))}
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {consignatarios.map((c) => {
                  const monthData = comisionesMap[c.id] ?? {}
                  const total = Object.values(monthData).reduce((s, v) => s + v, 0)
                  if (total === 0) return null
                  return (
                    <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-gray-800 sticky left-0 bg-white">
                        {c.nombre}
                      </td>
                      {allMonths.map((m) => (
                        <td key={m} className="px-4 py-3 text-right text-gray-600 whitespace-nowrap">
                          {monthData[m] != null ? formatearMoneda(monthData[m]) : '—'}
                        </td>
                      ))}
                      <td className="px-4 py-3 text-right font-semibold text-gray-800 whitespace-nowrap">
                        {formatearMoneda(total)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Section 2: Stock ─────────────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800">Stock por consignatario</h2>
          <p className="text-xs text-gray-400 mt-0.5">Dispositivos asignados y vendidos por consignatario</p>
        </div>

        {Object.keys(stockMap).length === 0 ? (
          <div className="px-6 py-10 text-center">
            <p className="text-sm text-gray-400">Sin stock asignado</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Consignatario
                </th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Asignados
                </th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Vendidos
                </th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Total
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {consignatarios.map((c) => {
                const stock = stockMap[c.id]
                if (!stock) return null
                const total = stock.asignados + stock.vendidos
                if (total === 0) return null
                return (
                  <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-800">{c.nombre}</td>
                    <td className="px-4 py-3 text-right text-blue-600 font-medium">{stock.asignados}</td>
                    <td className="px-4 py-3 text-right text-gray-500 font-medium">{stock.vendidos}</td>
                    <td className="px-4 py-3 text-right font-bold text-gray-800">{total}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Section 3: Diferencias pendientes ────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800">Diferencias pendientes por consignatario</h2>
          <p className="text-xs text-gray-400 mt-0.5">Faltantes y sobrantes sin resolver</p>
        </div>

        {Object.keys(difMap).length === 0 ? (
          <div className="px-6 py-10 text-center">
            <p className="text-sm text-gray-400">Sin diferencias pendientes</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Consignatario
                </th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Diferencias
                </th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Monto total
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {consignatarios.map((c) => {
                const dif = difMap[c.id]
                if (!dif) return null
                return (
                  <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-800">{c.nombre}</td>
                    <td className="px-4 py-3 text-right text-red-600 font-medium">{dif.count}</td>
                    <td className="px-4 py-3 text-right text-red-600 font-bold">{formatearMoneda(dif.total)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
