export const dynamic = 'force-dynamic'
// La card de Soporte analiza hasta 500 mails de Gmail (60 dias)
export const maxDuration = 60

import { createClient } from '@/lib/supabase/server'
import { formatearMoneda, buscarPrecio } from '@/lib/utils'
import { fetchVentasHoy, fetchVentasUlt30d, fetchVentasMensualesAnio, fetchContracargos, fetchVentasHistoricas, fetchConversionGocuotas, fetchStockPropio, fetchStockPropioDetalle, fetchAddonStock, fetchTrustonicStats, fetchBloqueadosVsMora, fetchVentasGeografia, fetchVentasPorMarca, fetchTiempoEntrega, type VentaDiaria } from '@/lib/gocelular'
import { resumenVentasDia, proyectarVentasMensuales } from '@/lib/ventas-dia'
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

      {/* Proyección de ventas + Stock */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
        <ProyeccionVentasCard />
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-base font-semibold text-gray-900 mb-3">Stock disponible</h2>
          <div className="grid grid-cols-3 xl:grid-cols-5 gap-3">
            {[
              { href: '/inventario/celulares', label: 'Celulares', stock: stockPropio, valor: valorPropio, color: 'text-magenta-700', bg: 'bg-magenta-50' },
              { href: '/inventario/smartwatches', label: 'Smartwatches', stock: stockSmartwatch, valor: valorSmartwatch, color: 'text-blue-700', bg: 'bg-blue-50' },
              { href: '/inventario/parlantes', label: 'Parlantes', stock: stockParlantes, valor: valorParlantes, color: 'text-purple-700', bg: 'bg-purple-50' },
              { href: '/inventario/auriculares', label: 'Auriculares', stock: stockAuriculares, valor: valorAuriculares, color: 'text-cyan-700', bg: 'bg-cyan-50' },
              { href: '/inventario/kits-seguridad', label: 'Kits', stock: stockKits, valor: valorKits, color: 'text-amber-700', bg: 'bg-amber-50' },
            ].map(cat => (
              <Link key={cat.href} href={cat.href} className={`${cat.bg} rounded-lg p-4 text-center hover:shadow-md transition-shadow`}>
                <p className="text-sm text-gray-500 mb-1 truncate">{cat.label}</p>
                <p className={`text-2xl font-bold ${cat.color}`}>{cat.stock}</p>
                <p className="text-xs text-gray-400">unidades</p>
                <p className={`text-sm font-semibold ${cat.color} mt-1`}>{formatearMoneda(cat.valor)}</p>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Contracargos + Bloqueados vs Mora */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        <div className={`rounded-xl border p-5 ${contracargos.cantidad > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200'}`}>
          <h2 className="text-base font-semibold text-gray-900 mb-3">Contracargos</h2>
          <div className="grid grid-cols-2 gap-4">
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

        {/* Bloqueados vs Mora */}
        {(() => {
        const m = bloqueadosVsMora
        const pct = (n: number) => m.ordenesMora > 0 ? ((n / m.ordenesMora) * 100).toFixed(1) + '%' : '0%'
        return (
          <div className={`rounded-xl border p-5 ${m.sinBloquear > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200'}`}>
            <h2 className="text-base font-semibold text-gray-900 mb-3">Bloqueados vs Mora (&gt;4 días)</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
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
  let ventasUlt30d: VentaDiaria[] = []
  try {
    ;[ventasHoy, ventasUlt30d] = await Promise.all([fetchVentasHoy(), fetchVentasUlt30d()])
  } catch {
    // GOcelular no disponible
  }

  if (ventasHoy.length === 0 && ventasUlt30d.length === 0) return null

  const resumen = resumenVentasDia(ventasHoy, ventasUlt30d, prefixes)

  const canales = [
    { key: 'gocelular' as const, label: 'GOcelular', color: 'bg-magenta-50', borderColor: 'border-magenta-200', iconColor: 'text-magenta-700' },
    { key: 'terceros' as const, label: 'Terceros', color: 'bg-gray-50', borderColor: 'border-gray-200', iconColor: 'text-gray-700' },
  ]

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Ventas del día</h2>
          <p className="text-sm text-gray-500">{resumen.hoy.total.ventas} ventas · {formatearMoneda(resumen.hoy.total.monto)}</p>
        </div>
      </div>

      <div className="space-y-3">
        {canales.map((canal) => {
          const cifras = resumen.hoy[canal.key]
          const prom = resumen.prom30d[canal.key]

          const Wrapper = canal.key === 'terceros' ? 'a' : 'div'
          const extraProps = canal.key === 'terceros' ? { href: '/dashboard/terceros' } : {}
          return (
            <Wrapper key={canal.key} {...extraProps} className={`rounded-lg border ${canal.borderColor} ${canal.color} px-4 py-4 block ${canal.key === 'terceros' ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <h3 className={`text-base font-bold ${canal.iconColor}`}>{canal.label}</h3>
                  {canal.key === 'terceros' && cifras.ventas > 0 && (
                    <span className="text-xs text-gray-400">ver detalle →</span>
                  )}
                </div>
                <div className="flex items-center gap-4">
                  <p className={`text-2xl font-bold ${canal.iconColor}`}>{formatearMoneda(cifras.monto)}</p>
                  <div className="text-right min-w-[48px]">
                    <p className="text-xl font-bold text-gray-900">{cifras.ventas}</p>
                    <p className="text-xs text-gray-400">ventas</p>
                  </div>
                </div>
              </div>
              <p className="text-sm text-gray-500 mt-2">
                prom. <span className="font-semibold text-gray-700">{Math.round(prom.ventas)} ventas</span> · <span className="font-semibold text-gray-700">{formatearMoneda(Math.round(prom.monto))}</span> /día
              </p>
            </Wrapper>
          )
        })}
      </div>

      <div className="mt-4 pt-4 border-t border-gray-100">
        <p className="text-sm text-gray-500 mb-1">Promedio general (30d)</p>
        <p className="text-xl font-bold text-gray-900">
          {Math.round(resumen.prom30d.general.ventas)} ventas · {formatearMoneda(Math.round(resumen.prom30d.general.monto))} <span className="text-sm font-normal text-gray-500">/día</span>
        </p>
      </div>
    </div>
  )
}

const NOMBRES_MES: Record<string, string> = {
  '01': 'Enero', '02': 'Febrero', '03': 'Marzo', '04': 'Abril', '05': 'Mayo', '06': 'Junio',
  '07': 'Julio', '08': 'Agosto', '09': 'Septiembre', '10': 'Octubre', '11': 'Noviembre', '12': 'Diciembre',
}

async function ProyeccionVentasCard() {
  const supabase = createClient()
  const { data: consigs } = await supabase.from('consignatarios').select('nombre, store_prefix')
  const prefixes = (consigs ?? [])
    .filter((c: { store_prefix: string | null }) => c.store_prefix)
    .map((c: { nombre: string; store_prefix: string | null }) => ({
      nombre: c.nombre,
      prefix: c.store_prefix!.toLowerCase(),
    }))

  let mensuales: Awaited<ReturnType<typeof fetchVentasMensualesAnio>> = []
  try {
    mensuales = await fetchVentasMensualesAnio()
  } catch {
    // GOcelular no disponible
  }
  if (mensuales.length === 0) return null

  const mesActual = new Date().toISOString().slice(0, 7)
  const p = proyectarVentasMensuales(mensuales, prefixes, mesActual)
  if (p.proyeccion.length === 0 || p.mesesCerrados === 0) return null

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Ventas mensuales proyectadas</h2>
        <p className="text-sm text-gray-500">
          Real ene–{NOMBRES_MES[String(p.mesesCerrados).padStart(2, '0')].toLowerCase().slice(0, 3)}: prom. <span className="font-semibold text-gray-700">{Math.round(p.promedioMensualCerrado.ventas)} ventas · {formatearMoneda(Math.round(p.promedioMensualCerrado.monto))}</span> /mes
        </p>
      </div>
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {p.proyeccion.map((punto) => (
          <div key={punto.mes} className="bg-gray-50 rounded-lg p-4 text-center">
            <p className="text-sm text-gray-500 mb-1">{NOMBRES_MES[punto.mes.slice(5)]}</p>
            <p className="text-2xl font-bold text-gray-900">{Math.round(punto.ventas).toLocaleString('es-AR')}</p>
            <p className="text-xs text-gray-400">ventas</p>
            <p className="text-sm font-semibold text-magenta-700 mt-1">{formatearMoneda(Math.round(punto.monto))}</p>
          </div>
        ))}
      </div>
      <p className="text-xs text-gray-400 mt-3">Tendencia lineal sobre los meses cerrados del año · sin consignatarios</p>
    </div>
  )
}
