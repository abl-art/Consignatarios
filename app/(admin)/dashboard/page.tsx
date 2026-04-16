import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { formatearMoneda, diasDesde } from '@/lib/utils'
import { fetchVentasHoy, type VentaDiaria } from '@/lib/gocelular'
import PermanenciaChart from '@/components/PermanenciaChart'
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
    { data: liquidaciones },
  ] = await Promise.all([
    supabase.from('dispositivos').select('*', { count: 'exact', head: true }),
    supabase.from('dispositivos').select('*', { count: 'exact', head: true }).eq('estado', 'disponible'),
    supabase.from('dispositivos').select('*', { count: 'exact', head: true }).eq('estado', 'asignado'),
    supabase.from('dispositivos').select('*', { count: 'exact', head: true }).eq('estado', 'vendido'),
    supabase.from('consignatarios').select('*', { count: 'exact', head: true }),
    supabase.from('modelos').select('*', { count: 'exact', head: true }),
    supabase.from('ventas').select('consignatario_id, comision_monto, precio_venta, fecha_venta').gte('fecha_venta', primerDiaMes),
    supabase.from('diferencias').select('*, auditorias(consignatario_id)').eq('estado', 'pendiente'),
    supabase.from('consignatarios').select('id, nombre'),
    supabase.from('liquidaciones').select('estado, monto_a_pagar'),
  ])

  // Garantías totales
  const [{ data: consigsConGarantia }, { data: asignadosValor }, { data: difPendientes }] = await Promise.all([
    supabase.from('consignatarios').select('id, garantia'),
    supabase.from('dispositivos').select('consignatario_id, modelos(precio_costo)').eq('estado', 'asignado'),
    supabase.from('diferencias').select('monto_deuda, auditorias(consignatario_id)').eq('estado', 'pendiente'),
  ])

  const compromisoPorConsig: Record<string, number> = {}
  for (const d of ((asignadosValor ?? []) as unknown as { consignatario_id: string | null; modelos: { precio_costo: number } | null }[])) {
    if (!d.consignatario_id) continue
    compromisoPorConsig[d.consignatario_id] = (compromisoPorConsig[d.consignatario_id] ?? 0) + (d.modelos?.precio_costo ?? 0)
  }
  for (const d of ((difPendientes ?? []) as unknown as { monto_deuda: number; auditorias: { consignatario_id: string } | null }[])) {
    const cid = d.auditorias?.consignatario_id
    if (!cid) continue
    compromisoPorConsig[cid] = (compromisoPorConsig[cid] ?? 0) + (d.monto_deuda ?? 0)
  }

  let totalGarantiaAdmin = 0
  let totalDisponibleAdmin = 0
  for (const c of ((consigsConGarantia ?? []) as { id: string; garantia: number }[])) {
    totalGarantiaAdmin += c.garantia
    const comp = compromisoPorConsig[c.id] ?? 0
    totalDisponibleAdmin += Math.max(0, c.garantia - comp)
  }

  // Build consignatario name lookup (needed early for permanencia rows)
  const nombrePorId: Record<string, string> = {}
  for (const c of (consignatarios ?? []) as Pick<Consignatario, 'id' | 'nombre'>[]) {
    nombrePorId[c.id] = c.nombre
  }

  // Permanencia promedio por modelo y consignatario (solo dispositivos asignados)
  const { data: asignadosDetalle } = await supabase
    .from('dispositivos')
    .select('fecha_asignacion, consignatario_id, modelos(marca, modelo)')
    .eq('estado', 'asignado')

  type AsignadoRow = {
    fecha_asignacion: string | null
    consignatario_id: string | null
    modelos: { marca: string; modelo: string } | null
  }
  type PermaBucket = { sumaDias: number; cantidad: number; marca: string; modelo: string; consignatarioId: string }
  const permanenciaMap: Record<string, PermaBucket> = {}
  for (const d of ((asignadosDetalle ?? []) as unknown as AsignadoRow[])) {
    if (!d.modelos || !d.consignatario_id) continue
    const key = `${d.consignatario_id}|${d.modelos.marca}|${d.modelos.modelo}`
    if (!permanenciaMap[key]) {
      permanenciaMap[key] = {
        sumaDias: 0,
        cantidad: 0,
        marca: d.modelos.marca,
        modelo: d.modelos.modelo,
        consignatarioId: d.consignatario_id,
      }
    }
    const dias = diasDesde(d.fecha_asignacion)
    if (dias !== null) {
      permanenciaMap[key].sumaDias += dias
      permanenciaMap[key].cantidad++
    }
  }
  const permanenciaRows = Object.values(permanenciaMap)
    .filter((v) => v.cantidad > 0)
    .map((v) => ({
      modelo: v.modelo,
      marca: v.marca,
      consignatarioId: v.consignatarioId,
      consignatarioNombre: nombrePorId[v.consignatarioId] ?? v.consignatarioId,
      dias: Math.round(v.sumaDias / v.cantidad),
      cantidad: v.cantidad,
    }))

  const stats = [
    { label: 'Dispositivos totales', value: totalDispositivos ?? 0, color: 'text-magenta-700' },
    { label: 'Disponibles', value: disponibles ?? 0, color: 'text-green-700' },
    { label: 'Asignados', value: asignados ?? 0, color: 'text-amber-700' },
    { label: 'Vendidos', value: vendidos ?? 0, color: 'text-purple-700' },
    { label: 'Consignatarios', value: totalConsignatarios ?? 0, color: 'text-cyan-700' },
    { label: 'Modelos', value: totalModelos ?? 0, color: 'text-gray-700' },
  ]

  // Comisiones y ventas por consignatario this month
  const comisionesPorConsignatario: Record<string, number> = {}
  let totalVentasMontoMes = 0
  let ventasCountMes = 0
  for (const v of (ventas ?? []) as Pick<Venta, 'consignatario_id' | 'comision_monto' | 'precio_venta' | 'fecha_venta'>[]) {
    if (!comisionesPorConsignatario[v.consignatario_id]) {
      comisionesPorConsignatario[v.consignatario_id] = 0
    }
    comisionesPorConsignatario[v.consignatario_id] += v.comision_monto
    totalVentasMontoMes += v.precio_venta ?? 0
    ventasCountMes++
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

  // Liquidaciones por estado
  const liqPorEstado: Record<string, number> = { retenida: 0, pendiente: 0, bloqueada: 0, pagada: 0 }
  for (const l of (liquidaciones ?? []) as { estado: string; monto_a_pagar: number }[]) {
    liqPorEstado[l.estado] = (liqPorEstado[l.estado] ?? 0) + l.monto_a_pagar
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Dashboard</h1>
      <p className="text-sm text-gray-500 mb-6">Resumen general del sistema de consignación</p>

      <VentasDelDia />

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6 mt-6">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-sm text-gray-500 mb-1">{stat.label}</p>
            <p className={`text-3xl font-bold ${stat.color}`}>
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      {/* Garantías */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-900">Garantías</h2>
          <Link href="/garantias" className="text-sm text-magenta-600 hover:text-magenta-800">Ver detalle →</Link>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <p className="text-xs text-gray-500 mb-1">Total</p>
            <p className="text-2xl font-bold text-gray-900">{formatearMoneda(totalGarantiaAdmin)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Comprometido</p>
            <p className="text-2xl font-bold text-amber-700">{formatearMoneda(totalGarantiaAdmin - totalDisponibleAdmin)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Disponible</p>
            <p className="text-2xl font-bold text-green-700">{formatearMoneda(totalDisponibleAdmin)}</p>
          </div>
        </div>
      </div>

      {/* Ventas del mes */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-900">Ventas del mes — {mesActual}</h2>
          <Link href="/ventas" className="text-sm text-magenta-600 hover:text-magenta-800">Ver detalle →</Link>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <p className="text-xs text-gray-500 mb-1">Cantidad</p>
            <p className="text-2xl font-bold text-gray-900">{ventasCountMes}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Monto total</p>
            <p className="text-2xl font-bold text-gray-900">{formatearMoneda(totalVentasMontoMes)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Comisiones</p>
            <p className="text-2xl font-bold text-magenta-700">{formatearMoneda(totalComisiones)}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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

        {/* Liquidaciones */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-gray-900">Liquidaciones</h2>
            <Link href="/liquidaciones" className="text-sm text-magenta-600 hover:text-magenta-800">
              Ver todas →
            </Link>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-gray-700">Por pagar</span>
              <span className="font-medium text-blue-700">{formatearMoneda(liqPorEstado.pendiente)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-700">Retenidas</span>
              <span className="font-medium text-yellow-700">{formatearMoneda(liqPorEstado.retenida)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-700">Bloqueadas</span>
              <span className="font-medium text-red-700">{formatearMoneda(liqPorEstado.bloqueada)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Permanencia promedio por modelo */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mt-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Permanencia promedio en stock</h2>
            <p className="text-xs text-gray-500">Días promedio que un equipo asignado lleva sin venderse, por modelo</p>
          </div>
          <div className="flex gap-3 text-xs text-gray-500">
            <span><span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-1"></span>{'<'} 30</span>
            <span><span className="inline-block w-2 h-2 rounded-full bg-yellow-500 mr-1"></span>30-60</span>
            <span><span className="inline-block w-2 h-2 rounded-full bg-red-500 mr-1"></span>{'>'} 60</span>
          </div>
        </div>
        {permanenciaRows.length === 0 ? (
          <p className="text-sm text-gray-500 py-8 text-center">Sin equipos asignados para medir permanencia.</p>
        ) : (
          <PermanenciaChart rows={permanenciaRows} />
        )}
      </div>

    </div>
  )
}

async function VentasDelDia() {
  const supabase = createClient()
  const { data: consigs } = await supabase.from('consignatarios').select('nombre, store_prefix')
  const prefixes = (consigs ?? [])
    .filter((c: { store_prefix: string | null }) => c.store_prefix)
    .map((c: { nombre: string; store_prefix: string | null }) => ({
      nombre: c.nombre,
      prefix: c.store_prefix!.toLowerCase(),
    }))

  let ventasHoy: VentaDiaria[] = []
  try {
    ventasHoy = await fetchVentasHoy()
  } catch {
    // GOcelular no disponible
  }

  if (ventasHoy.length === 0) return null

  // Clasificar cada store_name en canal
  type Canal = 'gocelular' | 'consignatarios' | 'terceros'
  interface VentaClasificada extends VentaDiaria {
    canal: Canal
    consignatarioNombre?: string
  }

  const clasificadas: VentaClasificada[] = ventasHoy.map((v) => {
    const lower = v.store_name.toLowerCase()
    if (lower.startsWith('ecommerce')) {
      return { ...v, canal: 'gocelular' }
    }
    const match = prefixes.find((p) => lower.startsWith(p.prefix))
    if (match) {
      return { ...v, canal: 'consignatarios', consignatarioNombre: match.nombre }
    }
    return { ...v, canal: 'terceros' }
  })

  const canales: { key: Canal; label: string; color: string; borderColor: string; iconColor: string }[] = [
    { key: 'gocelular', label: 'GOcelular', color: 'bg-magenta-50', borderColor: 'border-magenta-200', iconColor: 'text-magenta-700' },
    { key: 'consignatarios', label: 'Consignatarios', color: 'bg-blue-50', borderColor: 'border-blue-200', iconColor: 'text-blue-700' },
    { key: 'terceros', label: 'Terceros', color: 'bg-gray-50', borderColor: 'border-gray-200', iconColor: 'text-gray-700' },
  ]

  const totalVentas = clasificadas.reduce((s, v) => s + v.ventas, 0)
  const totalMonto = clasificadas.reduce((s, v) => s + v.monto, 0)

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 mt-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Ventas del día — GOcelular</h2>
          <p className="text-xs text-gray-500">{totalVentas} ventas · {formatearMoneda(totalMonto)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {canales.map((canal) => {
          const items = clasificadas.filter((v) => v.canal === canal.key)
          const canalVentas = items.reduce((s, v) => s + v.ventas, 0)
          const canalMonto = items.reduce((s, v) => s + v.monto, 0)

          return (
            <div key={canal.key} className={`rounded-xl border ${canal.borderColor} ${canal.color} p-4`}>
              <div className="flex items-center justify-between mb-3">
                <h3 className={`text-sm font-bold ${canal.iconColor}`}>{canal.label}</h3>
                <div className="text-right">
                  <p className="text-lg font-bold text-gray-900">{canalVentas}</p>
                  <p className="text-xs text-gray-500">ventas</p>
                </div>
              </div>
              <p className={`text-xl font-bold ${canal.iconColor} mb-3`}>{formatearMoneda(canalMonto)}</p>

              {items.length > 0 ? (
                <div className="space-y-1.5">
                  {items.map((v) => (
                    <div key={v.store_name} className="flex items-center justify-between text-xs">
                      <span className="text-gray-700 truncate mr-2">
                        {v.consignatarioNombre ?? v.store_name}
                      </span>
                      <span className="text-gray-600 shrink-0">
                        {v.ventas} · {formatearMoneda(v.monto)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-400">Sin ventas hoy</p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
