export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { formatearMoneda } from '@/lib/utils'
import { fetchVentasTerceros } from '@/lib/gocelular'

export default async function TercerosPage() {
  const supabase = createClient()
  const [ventas, { data: consigs }] = await Promise.all([
    fetchVentasTerceros(),
    supabase.from('consignatarios').select('store_prefix'),
  ])

  const prefixes = (consigs ?? [])
    .filter((c: { store_prefix: string | null }) => c.store_prefix)
    .map((c: { store_prefix: string | null }) => c.store_prefix!.toLowerCase())

  // Filtrar solo terceros: no ecommerce, no consignatarios
  const terceros = ventas.filter(v => {
    const lower = v.store_name.toLowerCase()
    if (lower.startsWith('ecommerce')) return false
    if (prefixes.some(p => lower.startsWith(p))) return false
    return true
  })

  // Agrupar por merchant (extraer prefijo antes del primer " - " o usar store_name completo)
  const porMerchant: Record<string, { tiendas: typeof terceros; totalVentas: number; totalMonto: number }> = {}
  for (const t of terceros) {
    const parts = t.store_name.split(' - ')
    const merchant = parts[0].trim() || t.store_name
    if (!porMerchant[merchant]) porMerchant[merchant] = { tiendas: [], totalVentas: 0, totalMonto: 0 }
    porMerchant[merchant].tiendas.push(t)
    porMerchant[merchant].totalVentas += t.ventas
    porMerchant[merchant].totalMonto += t.monto
  }

  const merchantArray = Object.entries(porMerchant)
    .map(([nombre, data]) => ({ nombre, ...data }))
    .sort((a, b) => b.totalVentas - a.totalVentas)

  const totalVentas = terceros.reduce((s, t) => s + t.ventas, 0)
  const totalMonto = terceros.reduce((s, t) => s + t.monto, 0)

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <Link href="/dashboard" className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Dashboard
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Ventas de Terceros</h1>
      </div>
      <p className="text-sm text-gray-500 mb-6">Desde abril 2026 · {totalVentas} ventas · {formatearMoneda(totalMonto)}</p>

      {/* Resumen por merchant */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {merchantArray.map(m => (
          <div key={m.nombre} className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="font-bold text-gray-900 mb-2">{m.nombre}</h3>
            <div className="flex items-baseline gap-3">
              <p className="text-2xl font-bold text-magenta-700">{m.totalVentas}</p>
              <p className="text-sm text-gray-500">ventas</p>
            </div>
            <p className="text-lg font-semibold text-green-700 mt-1">{formatearMoneda(m.totalMonto)}</p>
            <div className="w-full bg-gray-200 rounded-full h-2 mt-3">
              <div className="bg-magenta-500 rounded-full h-2" style={{ width: `${Math.min(100, (m.totalVentas / Math.max(totalVentas, 1)) * 100)}%` }} />
            </div>
            <p className="text-[10px] text-gray-400 mt-1">{((m.totalVentas / Math.max(totalVentas, 1)) * 100).toFixed(1)}% del total terceros</p>
          </div>
        ))}
      </div>

      {/* Detalle por tienda de cada merchant */}
      <div className="space-y-4">
        {merchantArray.map(m => (
          <div key={m.nombre} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/60 flex items-center justify-between">
              <h2 className="font-bold text-gray-900">{m.nombre}</h2>
              <div className="flex items-center gap-4">
                <span className="text-sm text-gray-500">{m.totalVentas} ventas</span>
                <span className="text-sm font-semibold text-green-700">{formatearMoneda(m.totalMonto)}</span>
              </div>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-white">
                <tr className="border-b border-gray-100">
                  <th className="text-left px-6 py-2 font-medium text-gray-600">Tienda</th>
                  <th className="text-right px-6 py-2 font-medium text-gray-600">Ventas</th>
                  <th className="text-right px-6 py-2 font-medium text-gray-600">Monto</th>
                  <th className="text-right px-6 py-2 font-medium text-gray-600">Ticket prom.</th>
                  <th className="text-right px-6 py-2 font-medium text-gray-600">% merchant</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {m.tiendas.sort((a, b) => b.ventas - a.ventas).map(t => (
                  <tr key={t.store_name} className="hover:bg-gray-50">
                    <td className="px-6 py-2 text-gray-900">{t.store_name}</td>
                    <td className="px-6 py-2 text-right font-bold text-gray-900">{t.ventas}</td>
                    <td className="px-6 py-2 text-right text-green-700 font-medium">{formatearMoneda(t.monto)}</td>
                    <td className="px-6 py-2 text-right text-gray-600">{t.ventas > 0 ? formatearMoneda(Math.round(t.monto / t.ventas)) : '—'}</td>
                    <td className="px-6 py-2 text-right text-gray-500">{((t.ventas / Math.max(m.totalVentas, 1)) * 100).toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  )
}
