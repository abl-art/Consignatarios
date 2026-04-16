import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { formatearMoneda } from '@/lib/utils'
import type { Consignatario } from '@/lib/types'

export default async function GarantiasPage() {
  const supabase = createClient()

  const [{ data: consignatarios }, { data: asignados }, { data: diferencias }] = await Promise.all([
    supabase.from('consignatarios').select('*').order('nombre').returns<Consignatario[]>(),
    supabase.from('dispositivos').select('consignatario_id, modelos(precio_costo)').eq('estado', 'asignado'),
    supabase.from('diferencias').select('monto_deuda, auditorias(consignatario_id)').eq('estado', 'pendiente'),
  ])

  // Build compromiso por consignatario
  const valorStockMap: Record<string, number> = {}
  for (const d of ((asignados ?? []) as unknown as { consignatario_id: string | null; modelos: { precio_costo: number } | null }[])) {
    if (!d.consignatario_id) continue
    const costo = d.modelos?.precio_costo ?? 0
    valorStockMap[d.consignatario_id] = (valorStockMap[d.consignatario_id] ?? 0) + costo
  }

  const deudaMap: Record<string, number> = {}
  for (const d of ((diferencias ?? []) as unknown as { monto_deuda: number; auditorias: { consignatario_id: string } | null }[])) {
    const cid = d.auditorias?.consignatario_id
    if (!cid) continue
    deudaMap[cid] = (deudaMap[cid] ?? 0) + (d.monto_deuda ?? 0)
  }

  const consigs = consignatarios ?? []
  const rows = consigs.map((c) => {
    const valorStock = valorStockMap[c.id] ?? 0
    const deuda = deudaMap[c.id] ?? 0
    const compromiso = valorStock + deuda
    const disponible = Math.max(0, c.garantia - compromiso)
    const excedido = c.garantia > 0 && compromiso > c.garantia
    const pct = c.garantia > 0 ? Math.min(100, (compromiso / c.garantia) * 100) : 0
    return { ...c, valorStock, deuda, compromiso, disponible, excedido, pct }
  })

  const totalGarantia = consigs.reduce((s, c) => s + c.garantia, 0)
  const totalCompromiso = rows.reduce((s, r) => s + r.compromiso, 0)
  const totalDisponible = rows.reduce((s, r) => s + r.disponible, 0)
  const totalExcedido = rows.filter((r) => r.excedido).length

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Garantías</h1>
      <p className="text-sm text-gray-500 mb-8">Respaldo total y disponible por consignatario</p>

      {/* Totales */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-sm text-gray-500 mb-1">Garantía total</p>
          <p className="text-2xl font-bold text-gray-900">{formatearMoneda(totalGarantia)}</p>
          <p className="text-xs text-gray-400 mt-1">{consigs.length} consignatarios</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-sm text-gray-500 mb-1">Comprometido</p>
          <p className="text-2xl font-bold text-amber-700">{formatearMoneda(totalCompromiso)}</p>
          <p className="text-xs text-gray-400 mt-1">Stock asignado + deudas pendientes</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-sm text-gray-500 mb-1">Disponible</p>
          <p className="text-2xl font-bold text-green-700">{formatearMoneda(totalDisponible)}</p>
          {totalExcedido > 0 && (
            <p className="text-xs text-red-600 mt-1">{totalExcedido} consignatario{totalExcedido === 1 ? '' : 's'} excedido{totalExcedido === 1 ? '' : 's'}</p>
          )}
        </div>
      </div>

      {/* Tabla de consignatarios */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-6 py-3 font-medium text-gray-600">Consignatario</th>
              <th className="text-right px-6 py-3 font-medium text-gray-600">Garantía</th>
              <th className="text-right px-6 py-3 font-medium text-gray-600">Stock</th>
              <th className="text-right px-6 py-3 font-medium text-gray-600">Deuda pend.</th>
              <th className="text-right px-6 py-3 font-medium text-gray-600">Comprometido</th>
              <th className="text-right px-6 py-3 font-medium text-gray-600">Disponible</th>
              <th className="text-left px-6 py-3 font-medium text-gray-600 w-40">Uso</th>
              <th className="px-6 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-6 py-16 text-center text-gray-500">
                  No hay consignatarios cargados
                </td>
              </tr>
            ) : rows.map((r) => (
              <tr key={r.id} className="hover:bg-gray-50">
                <td className="px-6 py-3 font-medium text-gray-900">
                  <div>{r.nombre}</div>
                  <div className="text-xs text-gray-400">{r.email}</div>
                </td>
                <td className="px-6 py-3 text-right font-semibold text-gray-900">
                  {r.garantia === 0 ? (
                    <span className="text-xs text-amber-600">Sin configurar</span>
                  ) : (
                    formatearMoneda(r.garantia)
                  )}
                </td>
                <td className="px-6 py-3 text-right text-gray-700">{formatearMoneda(r.valorStock)}</td>
                <td className="px-6 py-3 text-right text-red-600">{r.deuda > 0 ? formatearMoneda(r.deuda) : '—'}</td>
                <td className="px-6 py-3 text-right font-medium text-amber-700">{formatearMoneda(r.compromiso)}</td>
                <td className="px-6 py-3 text-right">
                  <span className={`font-bold ${r.excedido ? 'text-red-700' : r.disponible < r.garantia * 0.2 ? 'text-amber-700' : 'text-green-700'}`}>
                    {formatearMoneda(r.disponible)}
                  </span>
                  {r.excedido && <div className="text-xs text-red-500">⚠ excedido</div>}
                </td>
                <td className="px-6 py-3">
                  {r.garantia > 0 ? (
                    <div className="w-full">
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full ${
                            r.excedido ? 'bg-red-500' : r.pct >= 80 ? 'bg-amber-500' : 'bg-green-500'
                          }`}
                          style={{ width: `${Math.min(100, r.pct)}%` }}
                        />
                      </div>
                      <div className="text-xs text-gray-500 mt-1">{r.pct.toFixed(0)}%</div>
                    </div>
                  ) : (
                    <span className="text-xs text-gray-400">—</span>
                  )}
                </td>
                <td className="px-6 py-3 text-right">
                  <Link href={`/consignatarios/${r.id}`} className="text-xs text-magenta-600 hover:text-magenta-800 font-medium">
                    Detalle →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
