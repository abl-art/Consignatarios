import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { formatearMoneda } from '@/lib/utils'
import type { Consignatario, Venta, Diferencia } from '@/lib/types'

export default async function DashboardPage() {
  const supabase = createClient()

  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const mesActual = `${year}-${month}`
  const primerDiaMes = `${mesActual}-01`

  const [
    { count: totalDispositivos },
    { count: disponibles },
    { count: asignados },
    { count: vendidos },
    { count: totalConsignatarios },
    { count: totalModelos },
    { data: ventas },
    { data: diferencias },
    { data: consignatarios },
  ] = await Promise.all([
    supabase.from('dispositivos').select('*', { count: 'exact', head: true }),
    supabase.from('dispositivos').select('*', { count: 'exact', head: true }).eq('estado', 'disponible'),
    supabase.from('dispositivos').select('*', { count: 'exact', head: true }).eq('estado', 'asignado'),
    supabase.from('dispositivos').select('*', { count: 'exact', head: true }).eq('estado', 'vendido'),
    supabase.from('consignatarios').select('*', { count: 'exact', head: true }),
    supabase.from('modelos').select('*', { count: 'exact', head: true }),
    supabase.from('ventas').select('consignatario_id, comision_monto, fecha_venta').gte('fecha_venta', primerDiaMes),
    supabase.from('diferencias').select('*, auditorias(consignatario_id)').eq('estado', 'pendiente'),
    supabase.from('consignatarios').select('id, nombre'),
  ])

  const stats = [
    { label: 'Dispositivos totales', value: totalDispositivos ?? 0, color: 'text-magenta-700' },
    { label: 'Disponibles', value: disponibles ?? 0, color: 'text-green-700' },
    { label: 'Asignados', value: asignados ?? 0, color: 'text-amber-700' },
    { label: 'Vendidos', value: vendidos ?? 0, color: 'text-purple-700' },
    { label: 'Consignatarios', value: totalConsignatarios ?? 0, color: 'text-cyan-700' },
    { label: 'Modelos', value: totalModelos ?? 0, color: 'text-gray-700' },
  ]

  // Build consignatario name lookup
  const nombrePorId: Record<string, string> = {}
  for (const c of (consignatarios ?? []) as Pick<Consignatario, 'id' | 'nombre'>[]) {
    nombrePorId[c.id] = c.nombre
  }

  // Comisiones por consignatario this month
  const comisionesPorConsignatario: Record<string, number> = {}
  for (const v of (ventas ?? []) as Pick<Venta, 'consignatario_id' | 'comision_monto' | 'fecha_venta'>[]) {
    if (!comisionesPorConsignatario[v.consignatario_id]) {
      comisionesPorConsignatario[v.consignatario_id] = 0
    }
    comisionesPorConsignatario[v.consignatario_id] += v.comision_monto
  }
  const comisionesOrdenadas = Object.entries(comisionesPorConsignatario).sort((a, b) => b[1] - a[1])
  const totalComisiones = comisionesOrdenadas.reduce((sum, [, monto]) => sum + monto, 0)

  // Diferencias por consignatario
  const diferenciasPorConsignatario: Record<string, number> = {}
  for (const d of (diferencias ?? []) as (Diferencia & { auditorias: { consignatario_id: string } | null })[]) {
    const consignatarioId = d.auditorias?.consignatario_id
    if (!consignatarioId) continue
    if (!diferenciasPorConsignatario[consignatarioId]) {
      diferenciasPorConsignatario[consignatarioId] = 0
    }
    diferenciasPorConsignatario[consignatarioId] += d.monto_deuda
  }
  const diferenciasOrdenadas = Object.entries(diferenciasPorConsignatario).sort((a, b) => b[1] - a[1])
  const totalDiferencias = diferenciasOrdenadas.reduce((sum, [, monto]) => sum + monto, 0)
  const hayDiferencias = diferenciasOrdenadas.length > 0

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Dashboard</h1>
      <p className="text-sm text-gray-500 mb-8">Resumen general del sistema de consignación</p>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-sm text-gray-500 mb-1">{stat.label}</p>
            <p className={`text-3xl font-bold ${stat.color}`}>
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Comisiones a pagar */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-gray-900">
              Comisiones a pagar — {mesActual}
            </h2>
            <Link href="/reportes" className="text-sm text-magenta-600 hover:text-magenta-800">
              Ver reportes →
            </Link>
          </div>
          {comisionesOrdenadas.length === 0 ? (
            <p className="text-sm text-gray-500">Sin ventas este mes</p>
          ) : (
            <div className="space-y-2">
              {comisionesOrdenadas.map(([consignatarioId, monto]) => (
                <div key={consignatarioId} className="flex items-center justify-between text-sm">
                  <span className="text-gray-700">{nombrePorId[consignatarioId] ?? consignatarioId}</span>
                  <span className="font-medium text-gray-900">{formatearMoneda(monto)}</span>
                </div>
              ))}
              <div className="flex items-center justify-between text-sm pt-2 border-t border-gray-100">
                <span className="font-semibold text-gray-900">Total</span>
                <span className="font-bold text-magenta-700">{formatearMoneda(totalComisiones)}</span>
              </div>
            </div>
          )}
        </div>

        {/* Diferencias pendientes */}
        <div className={`rounded-xl border p-5 ${hayDiferencias ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200'}`}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-gray-900">
              Diferencias pendientes
            </h2>
            <Link href="/diferencias" className="text-sm text-magenta-600 hover:text-magenta-800">
              Ver todas →
            </Link>
          </div>
          {diferenciasOrdenadas.length === 0 ? (
            <p className="text-sm text-gray-500">Sin diferencias pendientes</p>
          ) : (
            <div className="space-y-2">
              {diferenciasOrdenadas.map(([consignatarioId, monto]) => (
                <div key={consignatarioId} className="flex items-center justify-between text-sm">
                  <span className="text-gray-700">{nombrePorId[consignatarioId] ?? consignatarioId}</span>
                  <span className="font-medium text-gray-900">{formatearMoneda(monto)}</span>
                </div>
              ))}
              <div className="flex items-center justify-between text-sm pt-2 border-t border-red-200">
                <span className="font-semibold text-gray-900">Total</span>
                <span className="font-bold text-red-700">{formatearMoneda(totalDiferencias)}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
