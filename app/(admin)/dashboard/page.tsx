export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { formatearMoneda, buscarPrecio } from '@/lib/utils'
import { fetchVentasHoy, fetchContracargos, fetchVentasHistoricas, fetchConversionGocuotas, fetchStockPropio, fetchStockPropioDetalle, fetchAddonStock, fetchTrustonicStats, fetchBloqueadosVsMora, fetchVentasGeografia, fetchVentasPorMarca, fetchTiempoEntrega, CLIENT_IDS_PROPIOS, type VentaDiaria } from '@/lib/gocelular'
import { getMejorPrecio, getInventarioByCategoria } from '@/lib/actions/compras'
import { getModelosOcultos } from '@/lib/actions/kits-ocultos'
import Link from 'next/link'
import VentasHistoricasChart from './VentasHistoricasChart'
import SoporteCard from './SoporteCard'
import ConversionChart from './ConversionChart'
import GeografiaVentas from './GeografiaVentas'
import QueVendemos from './QueVendemos'

export default async function DashboardPage() {
  const supabase = createClient()

  const daysAgo7 = new Date(); daysAgo7.setDate(daysAgo7.getDate() - 7)
  const desde7d = daysAgo7.toISOString().slice(0, 10)
  const hoy = new Date().toISOString().slice(0, 10)

  const [contracargos, ventasHistoricas, conversionData, { data: consigs }, { count: stockConsignatarios }, stockPropio, stockDetalle, preciosNewsan, { data: dispConsig }, trustonic, bloqueadosVsMora, geografia, ventasMarca, tiempoEntrega, addons, modelosOcultos] = await Promise.all([
    fetchContracargos().catch(() => ({ monto_contracargos: 0, monto_total_ventas: 0, porcentaje: 0, cantidad: 0, ordenes_afectadas: 0 })),
    fetchVentasHistoricas().catch(() => []),
    fetchConversionGocuotas().catch(() => []),
    supabase.from('consignatarios').select('nombre, store_prefix'),
    supabase.from('dispositivos').select('*', { count: 'exact', head: true }).eq('estado', 'asignado'),
    fetchStockPropio(),
    fetchStockPropioDetalle(),
    getMejorPrecio(),
    supabase.from('dispositivos').select('modelos(marca, modelo)').eq('estado', 'asignado'),
    fetchTrustonicStats(),
    fetchBloqueadosVsMora().catch(() => ({ bloqueados: 0, enTransicion: 0, idle: 0, readyForUse: 0, ordenesMora: 0, sinBloquear: 0 })),
    fetchVentasGeografia().catch(() => ({ provincias: [], ciudades: [], totalOrdenes: 0, retirosSucursal: 0, pctRetiros: 0 })),
    fetchVentasPorMarca(desde7d, hoy).catch(() => []),
    fetchTiempoEntrega().catch(() => ({ promedioDias: 0, medianaDias: 0, totalEnvios: 0, promedio30d: 0, mediana30d: 0, envios30d: 0, promedioEntrega30d: 0, medianaEntrega30d: 0, entregas30d: 0 })),
    fetchAddonStock().catch(() => []),
    getModelosOcultos().catch(() => []),
  ])

  // Stock por categoría
  const SMARTWATCHES_KW = ['pulsera', 'band', 'watch', 'smartwatch', 'reloj']
  const AURICULARES_KW = ['buds', 'auricular', 'earphone', 'headphone', 'earbuds']
  const PARLANTES_KW = ['speaker', 'parlante', 'bocina', 'altavoz', 'jbl']

  const smartwatchItems = addons.filter(a => SMARTWATCHES_KW.some(k => a.displayName.toLowerCase().includes(k)))
  const auricularesItems = addons.filter(a => AURICULARES_KW.some(k => a.displayName.toLowerCase().includes(k)))
  const parlantesItems = addons.filter(a => PARLANTES_KW.some(k => a.displayName.toLowerCase().includes(k)))

  const stockSmartwatch = smartwatchItems.reduce((s, a) => s + a.stock, 0)
  const stockAuriculares = auricularesItems.reduce((s, a) => s + a.stock, 0)
  const stockParlantes = parlantesItems.reduce((s, a) => s + a.stock, 0)

  const valorSmartwatch = smartwatchItems.reduce((s, a) => s + a.stock * a.price, 0)
  const valorAuriculares = auricularesItems.reduce((s, a) => s + a.stock * a.price, 0)
  const valorParlantes = parlantesItems.reduce((s, a) => s + a.stock * a.price, 0)

  let stockKits = 0
  let valorKits = 0
  try {
    const kitsItems = await getInventarioByCategoria('Kits de Seguridad', modelosOcultos)
    stockKits = kitsItems.reduce((s, r) => s + r.disponible, 0)
    valorKits = kitsItems.reduce((s, r) => s + r.valuacion, 0)
  } catch { /* ignore */ }

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

      {/* Ventas del día + Tiempo de Entrega + Donde vendemos + Qué vendemos */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <VentasDelDia />
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Tiempo promedio de entrega</h2>
          <div className="space-y-4">
            <div>
              <p className="text-xs text-gray-500 mb-1">Orden confirmada → entregado</p>
              <div className="flex items-baseline gap-2">
                <p className="text-3xl font-bold text-gray-900">{tiempoEntrega.promedioEntrega30d}</p>
                <p className="text-sm text-gray-500">días</p>
              </div>
              <p className="text-[10px] text-gray-400 mt-0.5">
                promedio 30d · mediana {tiempoEntrega.medianaEntrega30d} · {tiempoEntrega.entregas30d.toLocaleString('es-AR')} entregas
              </p>
            </div>
            <div className="border-t border-gray-100 pt-3">
              <p className="text-xs text-gray-500 mb-1">Orden confirmada → tracking Andreani</p>
              <div className="flex items-baseline gap-2">
                <p className="text-xl font-bold text-gray-700">{tiempoEntrega.mediana30d}</p>
                <p className="text-sm text-gray-500">días</p>
              </div>
              <p className="text-[10px] text-gray-400 mt-0.5">mediana 30d · {tiempoEntrega.envios30d.toLocaleString('es-AR')} envíos · histórico {tiempoEntrega.medianaDias}</p>
            </div>
          </div>
        </div>
        <GeografiaVentas data={geografia} />
        <QueVendemos initialData={ventasMarca} />
      </div>

      {/* Contracargos + Stock */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
        <div className={`rounded-xl border p-5 ${contracargos.cantidad > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200'}`}>
          <h2 className="text-base font-semibold text-gray-900 mb-3">Contracargos</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-gray-500 mb-1">Monto incobrable</p>
              <p className="text-xl font-bold text-red-700">{formatearMoneda(contracargos.monto_contracargos)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">% sobre ventas</p>
              <p className="text-xl font-bold text-red-700">{contracargos.porcentaje.toFixed(2)}%</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">Órdenes afectadas</p>
              <p className="text-xl font-bold text-red-700">{contracargos.ordenes_afectadas}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">Contracargos</p>
              <p className="text-xl font-bold text-red-700">{contracargos.cantidad}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-base font-semibold text-gray-900 mb-3">Stock disponible</h2>
          <div className="grid grid-cols-5 gap-2">
            {[
              { href: '/inventario/celulares', label: 'Celulares', stock: stockPropio, valor: valorPropio, color: 'text-magenta-700', bg: 'bg-magenta-50' },
              { href: '/inventario/smartwatches', label: 'Smartwatches', stock: stockSmartwatch, valor: valorSmartwatch, color: 'text-blue-700', bg: 'bg-blue-50' },
              { href: '/inventario/parlantes', label: 'Parlantes', stock: stockParlantes, valor: valorParlantes, color: 'text-purple-700', bg: 'bg-purple-50' },
              { href: '/inventario/auriculares', label: 'Auriculares', stock: stockAuriculares, valor: valorAuriculares, color: 'text-cyan-700', bg: 'bg-cyan-50' },
              { href: '/inventario/kits-seguridad', label: 'Kits', stock: stockKits, valor: valorKits, color: 'text-amber-700', bg: 'bg-amber-50' },
            ].map(cat => (
              <Link key={cat.href} href={cat.href} className={`${cat.bg} rounded-lg p-3 text-center hover:shadow-md transition-shadow`}>
                <p className={`text-xl font-bold ${cat.color}`}>{cat.stock}</p>
                <p className="text-[10px] text-gray-500">{cat.label}</p>
                <p className={`text-[10px] ${cat.color} mt-0.5`}>{formatearMoneda(cat.valor)}</p>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Bloqueados vs Mora */}
      {(() => {
        const m = bloqueadosVsMora
        const pct = (n: number) => m.ordenesMora > 0 ? ((n / m.ordenesMora) * 100).toFixed(1) + '%' : '0%'
        return (
          <div className={`rounded-xl border p-5 mt-4 ${m.sinBloquear > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200'}`}>
            <h2 className="text-base font-semibold text-gray-900 mb-3">Bloqueados vs Mora (&gt;4 días)</h2>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-4">
              <div>
                <p className="text-xs text-gray-500 mb-1">Bloqueados</p>
                <p className="text-2xl font-bold text-red-700">{m.bloqueados.toLocaleString('es-AR')}</p>
                <p className="text-[10px] text-gray-400 mt-0.5">{pct(m.bloqueados)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">En transición</p>
                <p className="text-2xl font-bold text-amber-600">{m.enTransicion.toLocaleString('es-AR')}</p>
                <p className="text-[10px] text-gray-400 mt-0.5">{pct(m.enTransicion)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Idle</p>
                <p className="text-2xl font-bold text-gray-500">{m.idle.toLocaleString('es-AR')}</p>
                <p className="text-[10px] text-gray-400 mt-0.5">{pct(m.idle)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Ready for use</p>
                <p className="text-2xl font-bold text-gray-500">{m.readyForUse.toLocaleString('es-AR')}</p>
                <p className="text-[10px] text-gray-400 mt-0.5">{pct(m.readyForUse)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Total mora &gt;4d</p>
                <p className="text-2xl font-bold text-gray-700">{m.ordenesMora.toLocaleString('es-AR')}</p>
                <p className="text-[10px] text-gray-400 mt-0.5">100%</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Sin bloquear</p>
                <p className={`text-2xl font-bold ${m.sinBloquear > 0 ? 'text-red-700' : 'text-green-700'}`}>
                  {m.sinBloquear.toLocaleString('es-AR')}
                </p>
                <p className={`text-[10px] mt-0.5 ${m.sinBloquear > 0 ? 'text-red-500' : 'text-gray-400'}`}>{pct(m.sinBloquear)}</p>
              </div>
            </div>
          </div>
        )
      })()}

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

      {/* Soporte: top reclamos de clientes (mails Knox/Trustonic) */}
      <SoporteCard />

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
