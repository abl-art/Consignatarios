export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { formatearMoneda, buscarPrecio } from '@/lib/utils'
import { fetchVentasHoy, fetchContracargos, fetchVentasHistoricas, fetchConversionGocuotas, fetchStockPropio, fetchStockPropioDetalle, fetchTrustonicStats, fetchVentasGeografia, fetchTiempoEntrega, CLIENT_IDS_PROPIOS, type VentaDiaria } from '@/lib/gocelular'
import { getMejorPrecio } from '@/lib/actions/compras'
import VentasHistoricasChart from './VentasHistoricasChart'
import ConversionChart from './ConversionChart'
import GeografiaVentas from './GeografiaVentas'

export default async function DashboardPage() {
  const supabase = createClient()

  const [contracargos, ventasHistoricas, conversionData, { data: consigs }, { count: stockConsignatarios }, stockPropio, stockDetalle, preciosNewsan, { data: dispConsig }, trustonic, geografia, tiempoEntrega] = await Promise.all([
    fetchContracargos().catch(() => ({ monto_contracargos: 0, monto_total_ventas: 0, porcentaje: 0, cantidad: 0 })),
    fetchVentasHistoricas().catch(() => []),
    fetchConversionGocuotas().catch(() => []),
    supabase.from('consignatarios').select('nombre, store_prefix'),
    supabase.from('dispositivos').select('*', { count: 'exact', head: true }).eq('estado', 'asignado'),
    fetchStockPropio(),
    fetchStockPropioDetalle(),
    getMejorPrecio(),
    supabase.from('dispositivos').select('modelos(marca, modelo)').eq('estado', 'asignado'),
    fetchTrustonicStats(),
    fetchVentasGeografia().catch(() => ({ provincias: [], ciudades: [], totalOrdenes: 0, retirosSucursal: 0, pctRetiros: 0 })),
    fetchTiempoEntrega().catch(() => ({ promedioDias: 0, medianaDias: 0, totalEnvios: 0, promedio30d: 0, mediana30d: 0, envios30d: 0 })),
  ])

  // Valorización tenencia propia
  let valorPropio = 0
  stockDetalle.forEach(s => {
    const precio = buscarPrecio(preciosNewsan, s.model_name)
    if (precio) valorPropio += s.qty * precio
  })

  // Valorización consignatarios
  let valorConsig = 0
  for (const row of dispConsig ?? []) {
    const m = row.modelos as unknown as { marca: string; modelo: string } | null
    if (!m) continue
    const precio = buscarPrecio(preciosNewsan, `${m.marca} ${m.modelo}`)
    if (precio) valorConsig += precio
  }
  const prefixes = (consigs ?? [])
    .filter((c: { store_prefix: string | null }) => c.store_prefix)
    .map((c: { nombre: string; store_prefix: string | null }) => ({
      nombre: c.nombre,
      prefix: c.store_prefix!.toLowerCase(),
    }))

  return (
    <div className="p-4 md:p-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Dashboard360</h1>
      <p className="text-sm text-gray-500 mb-6">Vista general de GOcelular</p>

      {/* Ventas del día + Tiempo de Entrega + Donde vendemos */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <VentasDelDia />
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-base font-semibold text-gray-900 mb-3">Tiempo promedio de entrega</h2>
          <p className="text-[10px] text-gray-400 -mt-2 mb-4">Orden confirmada → tracking Andreani</p>
          <div className="space-y-4">
            <div>
              <p className="text-xs text-gray-500 mb-1">Últimos 30 días</p>
              <div className="flex items-baseline gap-2">
                <p className="text-3xl font-bold text-gray-900">{tiempoEntrega.mediana30d}</p>
                <p className="text-sm text-gray-500">días</p>
              </div>
              <p className="text-[10px] text-gray-400 mt-0.5">mediana · {tiempoEntrega.envios30d.toLocaleString('es-AR')} envíos</p>
            </div>
            <div className="border-t border-gray-100 pt-3">
              <p className="text-xs text-gray-500 mb-1">Histórico</p>
              <div className="flex items-baseline gap-2">
                <p className="text-xl font-bold text-gray-700">{tiempoEntrega.medianaDias}</p>
                <p className="text-sm text-gray-500">días</p>
              </div>
              <p className="text-[10px] text-gray-400 mt-0.5">mediana · {tiempoEntrega.totalEnvios.toLocaleString('es-AR')} envíos</p>
            </div>
          </div>
        </div>
        <GeografiaVentas data={geografia} />
      </div>

      {/* Contracargos + Stock */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
        <div className={`rounded-xl border p-5 ${contracargos.cantidad > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200'}`}>
          <h2 className="text-base font-semibold text-gray-900 mb-3">Contracargos</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <p className="text-xs text-gray-500 mb-1">Monto total</p>
              <p className="text-xl font-bold text-red-700">{formatearMoneda(contracargos.monto_contracargos)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">% sobre ventas</p>
              <p className="text-xl font-bold text-red-700">{contracargos.porcentaje.toFixed(2)}%</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">Cantidad</p>
              <p className="text-xl font-bold text-red-700">{contracargos.cantidad}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-base font-semibold text-gray-900 mb-3">Stock disponible</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <p className="text-xs text-gray-500 mb-1">Tenencia propia</p>
              <p className="text-xl font-bold text-blue-700">{stockPropio}</p>
              <p className="text-xs text-blue-600 mt-0.5">{formatearMoneda(valorPropio)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">En consignatarios</p>
              <p className="text-xl font-bold text-amber-700">{stockConsignatarios ?? 0}</p>
              <p className="text-xs text-amber-600 mt-0.5">{formatearMoneda(valorConsig)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">Total</p>
              <p className="text-xl font-bold text-gray-900">{(stockPropio) + (stockConsignatarios ?? 0)}</p>
              <p className="text-xs text-green-700 font-medium mt-0.5">{formatearMoneda(valorPropio + valorConsig)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Trustonic - ancho completo */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mt-4">
        <h2 className="text-base font-semibold text-gray-900 mb-3">Trustonic</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
          <div>
            <p className="text-xs text-gray-500 mb-1">Activos</p>
            <p className="text-xl font-bold text-green-700">{trustonic.activos.toLocaleString('es-AR')}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Bloqueados</p>
            <p className="text-xl font-bold text-red-700">{trustonic.bloqueados}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">% Bloqueados</p>
            <p className={`text-xl font-bold ${trustonic.pctBloqueados > 5 ? 'text-red-700' : 'text-gray-900'}`}>{trustonic.pctBloqueados}%</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Tasa de activación</p>
            <p className={`text-xl font-bold ${trustonic.tasaActivacion >= 90 ? 'text-green-700' : 'text-amber-700'}`}>{trustonic.tasaActivacion}%</p>
            <p className="text-[10px] text-gray-400">activos / asignados (sin idle)</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Mediana activación</p>
            <p className="text-xl font-bold text-gray-900">{trustonic.tiempoPromActivacionDias} días</p>
            <p className="text-[10px] text-gray-400">P50 asignación → activo (&le;40d)</p>
          </div>
        </div>
      </div>

      {/* Ventas históricas */}
      <div className="mt-6">
        <VentasHistoricasChart data={ventasHistoricas} prefixes={prefixes} />
      </div>

      {/* Conversión GOcuotas */}
      <div className="mt-6">
        <ConversionChart data={conversionData} />
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

  type Canal = 'gocelular' | 'consignatarios' | 'terceros'
  interface VentaClasificada extends VentaDiaria {
    canal: Canal
    consignatarioNombre?: string
  }

  const clasificadas: VentaClasificada[] = ventasHoy.map((v) => {
    // Client IDs propios son siempre venta propia
    if (CLIENT_IDS_PROPIOS.includes(v.client_id)) {
      return { ...v, canal: 'gocelular' }
    }
    const lower = v.store_name.toLowerCase()
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
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Ventas del día</h2>
          <p className="text-xs text-gray-500">{totalVentas} ventas · {formatearMoneda(totalMonto)}</p>
        </div>
      </div>

      <div className="space-y-2">
        {canales.map((canal) => {
          const items = clasificadas.filter((v) => v.canal === canal.key)
          const canalVentas = items.reduce((s, v) => s + v.ventas, 0)
          const canalMonto = items.reduce((s, v) => s + v.monto, 0)

          const Wrapper = canal.key === 'terceros' ? 'a' : 'div'
          const extraProps = canal.key === 'terceros' ? { href: '/dashboard/terceros' } : {}
          return (
            <Wrapper key={canal.key} {...extraProps} className={`flex items-center justify-between rounded-lg border ${canal.borderColor} ${canal.color} px-4 py-3 ${canal.key === 'terceros' ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`}>
              <div className="flex items-center gap-3">
                <h3 className={`text-sm font-bold ${canal.iconColor}`}>{canal.label}</h3>
                {canal.key === 'terceros' && canalVentas > 0 && (
                  <span className="text-[10px] text-gray-400">ver detalle →</span>
                )}
              </div>
              <div className="flex items-center gap-4">
                <p className={`text-lg font-bold ${canal.iconColor}`}>{formatearMoneda(canalMonto)}</p>
                <div className="text-right min-w-[40px]">
                  <p className="text-sm font-bold text-gray-900">{canalVentas}</p>
                  <p className="text-[10px] text-gray-400">ventas</p>
                </div>
              </div>
            </Wrapper>
          )
        })}
      </div>
    </div>
  )
}
