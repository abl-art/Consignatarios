import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getCurrentConsignatario } from '@/lib/consignatario-helpers'
import { formatearMoneda } from '@/lib/utils'
import VentasChart from '@/components/VentasChart'
import type { Liquidacion } from '@/lib/types'

export default async function ConsignatarioDashboardPage() {
  const consignatario = await getCurrentConsignatario()
  const supabase = createClient()

  const now = new Date()
  const from = new Date(now.getFullYear(), now.getMonth() - 11, 1)
  const fromIso = from.toISOString().split('T')[0]

  const [
    { data: asignados },
    { data: diferencias },
    { data: ventas },
    { data: liquidaciones },
  ] = await Promise.all([
    supabase.from('dispositivos').select('id, modelos(precio_costo)')
      .eq('consignatario_id', consignatario.id).eq('estado', 'asignado'),
    supabase.from('diferencias').select('monto_deuda, auditorias!inner(consignatario_id)')
      .eq('auditorias.consignatario_id', consignatario.id).eq('estado', 'pendiente'),
    supabase.from('ventas').select('fecha_venta, precio_venta, comision_monto')
      .eq('consignatario_id', consignatario.id).gte('fecha_venta', fromIso),
    supabase.from('liquidaciones').select('*').eq('consignatario_id', consignatario.id)
      .order('mes', { ascending: false }).limit(3).returns<Liquidacion[]>(),
  ])

  const valorStock = ((asignados ?? []) as unknown as { modelos: { precio_costo: number } | null }[])
    .reduce((s, d) => s + (d.modelos?.precio_costo ?? 0), 0)
  const totalDeuda = ((diferencias ?? []) as unknown as { monto_deuda: number }[])
    .reduce((s, d) => s + d.monto_deuda, 0)
  const compromiso = valorStock + totalDeuda
  const garantia = consignatario.garantia
  const disponible = Math.max(0, garantia - compromiso)

  // Ventas por mes (últimos 12 meses)
  const ventasPorMes: Record<string, number> = {}
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1)
    const mes = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    ventasPorMes[mes] = 0
  }
  for (const v of ventas ?? []) {
    const mes = v.fecha_venta.slice(0, 7)
    if (ventasPorMes[mes] !== undefined) ventasPorMes[mes] += v.precio_venta ?? 0
  }
  const chartData = Object.entries(ventasPorMes).map(([mes, total]) => ({ mes: mes.slice(5), total }))

  const mesActual = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const comisionesMes = (ventas ?? [])
    .filter((v) => v.fecha_venta.startsWith(mesActual))
    .reduce((s, v) => s + (v.comision_monto ?? 0), 0)

  const liqRetenida = (liquidaciones ?? []).find((l) => l.estado === 'retenida')

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Hola, {consignatario.nombre}</h1>
        <p className="text-sm text-gray-500">Resumen de tu cuenta</p>
      </div>

      {liqRetenida && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
          <strong>Pago retenido — {liqRetenida.mes}.</strong> Completá la auto-auditoría para liberar {formatearMoneda(liqRetenida.monto_a_pagar)}.
          <Link href="/auto-auditoria" className="ml-2 underline font-medium">Ir a auto-auditoría →</Link>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-sm text-gray-500 mb-1">Garantía</p>
          <p className="text-2xl font-bold text-gray-900">{formatearMoneda(garantia)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-sm text-gray-500 mb-1">Comprometido</p>
          <p className="text-2xl font-bold text-amber-700">{formatearMoneda(compromiso)}</p>
          <p className="text-xs text-gray-400 mt-1">Stock + diferencias</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-sm text-gray-500 mb-1">Disponible</p>
          <p className={`text-2xl font-bold ${disponible === 0 ? 'text-red-700' : 'text-green-700'}`}>
            {formatearMoneda(disponible)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-sm text-gray-500 mb-1">Comisiones del mes</p>
          <p className="text-3xl font-bold text-magenta-700">{formatearMoneda(comisionesMes)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-sm text-gray-500 mb-1">Deuda pendiente por diferencias</p>
          <p className="text-3xl font-bold text-red-700">{formatearMoneda(totalDeuda)}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-base font-semibold text-gray-900 mb-4">Ventas (últimos 12 meses)</h2>
        <VentasChart data={chartData} />
      </div>
    </div>
  )
}
