export const dynamic = 'force-dynamic'
// La card de Soporte analiza hasta 500 mails de Gmail (60 dias)
export const maxDuration = 60

import { createClient } from '@/lib/supabase/server'
import { formatearMoneda, buscarPrecio } from '@/lib/utils'
import { fetchVentasHoy, fetchVentasUlt30d, fetchVentasGomarket, fetchContracargos, fetchVentasHistoricas, fetchConversionGocuotas, fetchTrustonicStats, fetchBloqueadosVsMora, fetchVentasGeografia, fetchVentasPorMarca, fetchTiempoEntrega, fetchAccesoriosVentas30d, type VentaDiaria } from '@/lib/gocelular'
import { resumenAccesorios } from '@/lib/accesorios'
import { resumenVentasDia } from '@/lib/ventas-dia'
import { getProyeccionDashboard } from '@/lib/actions/proyecciones'
import { getMejorPrecio } from '@/lib/actions/compras'
import { fetchInventarioResumen, type ProductoKey } from '@/lib/actions/inventario-resumen'
import { fetchCuotasStats } from '@/lib/actions/finanzas'
import { fetchOrdenesIncobrables } from '@/lib/gocelular'
import { fetchMixSegmentos, type MixSegmentos } from '@/lib/segmentos'
import SegmentosClientes from './SegmentosClientes'
import DashboardTabs from '../finanzas/FinanzasTabs'
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

  const [contracargos, ventasHistoricas, conversionData, { data: consigs }, { count: stockConsignatarios }, preciosNewsan, { data: dispConsig }, trustonic, bloqueadosVsMora, geografia, ventasMarca, tiempoEntrega, inventarioResumen, cuotasStats, ordenesIncobrables, accesoriosRaw, mixSegmentos] = await Promise.all([
    fetchContracargos().catch(() => ({ monto_contracargos: 0, monto_total_ventas: 0, porcentaje: 0, cantidad: 0, ordenes_afectadas: 0 })),
    fetchVentasHistoricas().catch(() => []),
    fetchConversionGocuotas().catch(() => ({ diaria: [], mensual: [], ordenesPorUsuario30d: null })),
    supabase.from('consignatarios').select('nombre, store_prefix'),
    supabase.from('dispositivos').select('*', { count: 'exact', head: true }).eq('estado', 'asignado'),
    getMejorPrecio(),
    supabase.from('dispositivos').select('modelos(marca, modelo)').eq('estado', 'asignado'),
    fetchTrustonicStats(),
    fetchBloqueadosVsMora().catch(() => ({ bloqueados: 0, enTransicion: 0, idle: 0, readyForUse: 0, ordenesMora: 0, sinBloquear: 0 })),
    fetchVentasGeografia().catch(() => ({ provincias: [], ciudades: [], totalOrdenes: 0, retirosSucursal: 0, pctRetiros: 0 })),
    fetchVentasPorMarca(desde7d, hoy).catch(() => []),
    fetchTiempoEntrega().catch(() => ({ promedioDias: 0, medianaDias: 0, totalEnvios: 0, promedio30d: 0, mediana30d: 0, envios30d: 0, promedioEntrega30d: 0, medianaEntrega30d: 0, entregas30d: 0 })),
    fetchInventarioResumen().catch(() => ({ productos: [] })),
    fetchCuotasStats().catch(() => ({ monto_contracargos: 0 })),
    fetchOrdenesIncobrables().catch(() => [] as string[]),
    fetchAccesoriosVentas30d().catch(() => ({ ordenes: 0, conAccesorios: 0, montoCentavos: 0 })),
    fetchMixSegmentos().catch((): MixSegmentos => ({ filas: [], totalPropia: 0, totalTerceros: 0, totalClientes: 0, actualizadoAt: null })),
  ])
  const accesorios = resumenAccesorios(accesoriosRaw)

  // Stock disponible: los mismos datos que /inventario (fuente única)
  const inv = (key: ProductoKey) => inventarioResumen.productos.find(p => p.key === key)

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

  // --- Tarjetas (JSX) repartidas en pestañas estilo Finanzas ---

  const tiempoEntregaCard = (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Tiempo de entrega</h2>
        <p className="text-sm text-gray-500">últimos 30 días · desde la confirmación</p>
      </div>

      <div className="space-y-3">
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-blue-700">Entregado al cliente</h3>
            <div className="flex items-baseline gap-1.5">
              <p className="text-2xl font-bold text-blue-700">{tiempoEntrega.promedioEntrega30d}</p>
              <p className="text-xs text-gray-400">días</p>
            </div>
          </div>
          <p className="text-sm text-gray-500 mt-2">
            mediana <span className="font-semibold text-gray-700">{tiempoEntrega.medianaEntrega30d} días</span> · {tiempoEntrega.entregas30d.toLocaleString('es-AR')} entregas
          </p>
        </div>

        <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-gray-700">Despachado (tracking)</h3>
            <div className="flex items-baseline gap-1.5">
              <p className="text-2xl font-bold text-gray-700">{tiempoEntrega.mediana30d}</p>
              <p className="text-xs text-gray-400">días</p>
            </div>
          </div>
          <p className="text-sm text-gray-500 mt-2">
            mediana · {tiempoEntrega.envios30d.toLocaleString('es-AR')} envíos con tracking
          </p>
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-gray-100">
        <p className="text-sm text-gray-500 mb-1">Histórico completo</p>
        <p className="text-xl font-bold text-gray-900">
          {tiempoEntrega.medianaDias} días <span className="text-sm font-normal text-gray-500">mediana al despacho · {tiempoEntrega.totalEnvios.toLocaleString('es-AR')} envíos</span>
        </p>
      </div>
    </div>
  )

  const accesoriosCard = <AccesoriosCard accesorios={accesorios} />

  const stockCard = (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h2 className="text-base font-semibold text-gray-900 mb-3">Stock disponible</h2>
      <div className="grid grid-cols-3 xl:grid-cols-5 gap-3">
        {[
          { href: '/inventario', label: 'Celulares', stock: inv('celulares')?.stock ?? 0, valor: inv('celulares')?.valorVenta ?? 0, color: 'text-magenta-700', bg: 'bg-magenta-50' },
          { href: '/inventario', label: 'Smartwatches', stock: inv('smartwatches')?.stock ?? 0, valor: inv('smartwatches')?.valorVenta ?? 0, color: 'text-blue-700', bg: 'bg-blue-50' },
          { href: '/inventario', label: 'Parlantes', stock: inv('parlantes')?.stock ?? 0, valor: inv('parlantes')?.valorVenta ?? 0, color: 'text-purple-700', bg: 'bg-purple-50' },
          { href: '/inventario', label: 'Auriculares', stock: inv('auriculares')?.stock ?? 0, valor: inv('auriculares')?.valorVenta ?? 0, color: 'text-cyan-700', bg: 'bg-cyan-50' },
          { href: '/inventario/kits-seguridad', label: 'Kits', stock: inv('kits')?.stock ?? 0, valor: inv('kits')?.valorVenta ?? 0, color: 'text-amber-700', bg: 'bg-amber-50' },
        ].map(cat => (
          <Link key={cat.label} href={cat.href} className={`${cat.bg} rounded-lg p-4 text-center hover:shadow-md transition-shadow`}>
            <p className="text-sm text-gray-500 mb-1 truncate">{cat.label}</p>
            <p className={`text-2xl font-bold ${cat.color}`}>{cat.stock}</p>
            <p className="text-xs text-gray-400">unidades</p>
            <p className={`text-sm font-semibold ${cat.color} mt-1`}>{formatearMoneda(cat.valor)}</p>
          </Link>
        ))}
      </div>
    </div>
  )

  const incobrablesCard = (
    <div className={`rounded-xl border p-5 ${contracargos.cantidad > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200'}`}>
      <h2 className="text-base font-semibold text-gray-900 mb-3">Incobrables</h2>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-gray-500 mb-1">Monto incobrable</p>
          <p className="text-xl font-bold text-red-700">{formatearMoneda(cuotasStats.monto_contracargos)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500 mb-1">% sobre ventas</p>
          <p className="text-xl font-bold text-red-700">
            {contracargos.monto_total_ventas > 0 ? ((cuotasStats.monto_contracargos / contracargos.monto_total_ventas) * 100).toFixed(2) : '0.00'}%
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500 mb-1">Órdenes castigadas</p>
          <p className="text-xl font-bold text-red-700">{ordenesIncobrables.length}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500 mb-1">Contracargos</p>
          <p className="text-xl font-bold text-red-700">{contracargos.cantidad}</p>
        </div>
      </div>
      <p className="text-xs text-gray-400 mt-2">Contracargos + mora 90+ días + equipos en transición 30+ días (misma fuente que Finanzas)</p>
    </div>
  )

  const m = bloqueadosVsMora
  const pctMora = (n: number) => m.ordenesMora > 0 ? ((n / m.ordenesMora) * 100).toFixed(1) + '%' : '0%'
  const bloqueadosVsMoraCard = (
    <div className={`rounded-xl border p-5 ${m.sinBloquear > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200'}`}>
      <h2 className="text-base font-semibold text-gray-900 mb-3">Bloqueados vs Mora (&gt;4 días)</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <div>
          <p className="text-xs text-gray-500 mb-1">Bloqueados</p>
          <p className="text-2xl font-bold text-red-700">{m.bloqueados.toLocaleString('es-AR')}</p>
          <p className="text-[10px] text-gray-400 mt-0.5">{pctMora(m.bloqueados)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500 mb-1">En transición</p>
          <p className="text-2xl font-bold text-amber-600">{m.enTransicion.toLocaleString('es-AR')}</p>
          <p className="text-[10px] text-gray-400 mt-0.5">{pctMora(m.enTransicion)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500 mb-1">Idle</p>
          <p className="text-2xl font-bold text-gray-500">{m.idle.toLocaleString('es-AR')}</p>
          <p className="text-[10px] text-gray-400 mt-0.5">{pctMora(m.idle)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500 mb-1">Ready for use</p>
          <p className="text-2xl font-bold text-gray-500">{m.readyForUse.toLocaleString('es-AR')}</p>
          <p className="text-[10px] text-gray-400 mt-0.5">{pctMora(m.readyForUse)}</p>
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
          <p className={`text-[10px] mt-0.5 ${m.sinBloquear > 0 ? 'text-red-500' : 'text-gray-400'}`}>{pctMora(m.sinBloquear)}</p>
        </div>
      </div>
    </div>
  )

  const trustonicCard = (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h2 className="text-base font-semibold text-gray-900 mb-3">Trustonic</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
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
  )

  const tabs = [
    {
      id: 'performance',
      label: 'Performance',
      content: (
        <div className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <VentasDelDia />
            {tiempoEntregaCard}
            {accesoriosCard}
          </div>
          <VentasHistoricasChart data={ventasHistoricas} prefixes={prefixes} />
          <ConversionChart data={conversionData} />
        </div>
      ),
    },
    {
      id: 'negocio',
      label: 'Negocio',
      content: (
        <div className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <GeografiaVentas data={geografia} />
            <QueVendemos initialData={ventasMarca} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ProyeccionVentasCard />
            {stockCard}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {incobrablesCard}
          </div>
        </div>
      ),
    },
    {
      id: 'segmentos',
      label: 'Segmentos',
      content: <SegmentosClientes mix={mixSegmentos} />,
    },
    {
      id: 'soporte',
      label: 'Soporte',
      content: (
        <div className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {trustonicCard}
            {bloqueadosVsMoraCard}
          </div>
          <SoporteCard />
        </div>
      ),
    },
  ]

  return (
    <div className="p-4 md:p-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Dashboard360</h1>
      <p className="text-sm text-gray-500 mb-4">Vista general de GOcelular</p>
      <DashboardTabs tabs={tabs} />
    </div>
  )
}

// La tarjeta de accesorios aloja también los promedios diarios 30d por canal
// (mudados desde Ventas del día el 13/11 para acortar aquella tarjeta y
// aprovechar el espacio libre de esta). ventasUlt30d y gomarket vienen del
// cache (1h / 5min) — pedirlos de nuevo acá es gratis; hoy no hace falta.
async function AccesoriosCard({ accesorios }: { accesorios: { pct: number; conAccesorios: number; ordenes: number; monto: number } }) {
  const supabase = createClient()
  const { data: consigs } = await supabase.from('consignatarios').select('nombre, store_prefix')
  const prefixes = (consigs ?? [])
    .filter((c: { store_prefix: string | null }) => c.store_prefix)
    .map((c: { nombre: string; store_prefix: string | null }) => ({
      nombre: c.nombre,
      prefix: c.store_prefix!.toLowerCase(),
    }))

  let prom30d: ReturnType<typeof resumenVentasDia>['prom30d'] | null = null
  try {
    const [ventasUlt30d, ventasGomarket] = await Promise.all([fetchVentasUlt30d(), fetchVentasGomarket()])
    prom30d = resumenVentasDia([], ventasUlt30d, prefixes, ventasGomarket).prom30d
  } catch {
    // GOcelular no disponible: la tarjeta sale sin promedios
  }

  const filasProm = prom30d
    ? [
        { label: 'GOcelular', color: 'text-magenta-700', cifras: prom30d.gocelular },
        { label: 'Terceros', color: 'text-gray-700', cifras: prom30d.terceros },
        { label: 'GOmarket', color: 'text-emerald-700', cifras: prom30d.gomarket },
      ]
    : []

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Ventas con Accesorios</h2>
        <p className="text-sm text-gray-500">órdenes pagas de los últimos 30 días</p>
      </div>

      <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-emerald-700">Llevan accesorio</h3>
          <p className="text-2xl font-bold text-emerald-700">{accesorios.pct.toLocaleString('es-AR')}%</p>
        </div>
        <p className="text-sm text-gray-500 mt-2">
          <span className="font-semibold text-gray-700">{accesorios.conAccesorios.toLocaleString('es-AR')}</span> de{' '}
          {accesorios.ordenes.toLocaleString('es-AR')} órdenes ·{' '}
          <span className="font-semibold text-gray-700">
            {accesorios.monto >= 1e6
              ? `$${(accesorios.monto / 1e6).toLocaleString('es-AR', { maximumFractionDigits: 1 })}M`
              : formatearMoneda(accesorios.monto)}
          </span>{' '}
          facturados
        </p>
      </div>

      {prom30d && (
        <div className="mt-4 pt-4 border-t border-gray-100">
          <p className="text-sm text-gray-500 mb-2">Promedio de ventas por día (30d)</p>
          <div className="space-y-1.5">
            {filasProm.map(f => (
              <div key={f.label} className="flex items-baseline justify-between text-sm">
                <span className={`font-medium ${f.color}`}>{f.label}</span>
                <span className="text-gray-700">
                  <span className="font-semibold text-gray-900">{Math.round(f.cifras.ventas)}</span> ventas ·{' '}
                  <span className="font-semibold text-gray-900">{formatearMoneda(Math.round(f.cifras.monto))}</span>
                </span>
              </div>
            ))}
            <div className="flex items-baseline justify-between text-sm pt-1.5 border-t border-gray-100">
              <span className="font-semibold text-gray-900">General</span>
              <span className="text-gray-700">
                <span className="font-bold text-gray-900">{Math.round(prom30d.general.ventas)}</span> ventas ·{' '}
                <span className="font-bold text-gray-900">{formatearMoneda(Math.round(prom30d.general.monto))}</span>
              </span>
            </div>
          </div>
        </div>
      )}
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
  let ventasGomarket = { hoy: { ventas: 0, monto: 0 }, total30d: { ventas: 0, monto: 0 } }
  try {
    ;[ventasHoy, ventasUlt30d, ventasGomarket] = await Promise.all([fetchVentasHoy(), fetchVentasUlt30d(), fetchVentasGomarket()])
  } catch {
    // GOcelular no disponible
  }

  if (ventasHoy.length === 0 && ventasUlt30d.length === 0) return null

  const resumen = resumenVentasDia(ventasHoy, ventasUlt30d, prefixes, ventasGomarket)

  const canales = [
    { key: 'gocelular' as const, label: 'GOcelular', color: 'bg-magenta-50', borderColor: 'border-magenta-200', iconColor: 'text-magenta-700' },
    { key: 'terceros' as const, label: 'Terceros', color: 'bg-gray-50', borderColor: 'border-gray-200', iconColor: 'text-gray-700' },
    { key: 'gomarket' as const, label: 'GOmarket', color: 'bg-emerald-50', borderColor: 'border-emerald-200', iconColor: 'text-emerald-700' },
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

          return (
            <div key={canal.key} className={`rounded-lg border ${canal.borderColor} ${canal.color} px-4 py-4`}>
              {/* Los promedios 30d viven en la tarjeta Ventas con Accesorios
                  (pedido de Emiliano 13/11: acortar esta tarjeta) */}
              <div className="flex items-center justify-between">
                <h3 className={`text-base font-bold ${canal.iconColor}`}>{canal.label}</h3>
                <div className="flex items-center gap-4">
                  <p className={`text-2xl font-bold ${canal.iconColor}`}>{formatearMoneda(cifras.monto)}</p>
                  <div className="text-right min-w-[48px]">
                    <p className="text-xl font-bold text-gray-900">{cifras.ventas}</p>
                    <p className="text-xs text-gray-400">ventas</p>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

const NOMBRES_MES: Record<string, string> = {
  '01': 'Enero', '02': 'Febrero', '03': 'Marzo', '04': 'Abril', '05': 'Mayo', '06': 'Junio',
  '07': 'Julio', '08': 'Agosto', '09': 'Septiembre', '10': 'Octubre', '11': 'Noviembre', '12': 'Diciembre',
}

async function ProyeccionVentasCard() {
  let proyeccion: Awaited<ReturnType<typeof getProyeccionDashboard>> = null
  try {
    proyeccion = await getProyeccionDashboard()
  } catch {
    // Supabase no disponible
  }
  if (!proyeccion || proyeccion.meses.length === 0) return null

  const anioActual = new Date().toISOString().slice(0, 4)
  const etiqueta = (mes: string) => `${NOMBRES_MES[mes.slice(5)]}${mes.slice(0, 4) !== anioActual ? ` ${mes.slice(0, 4)}` : ''}`

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Ventas mensuales proyectadas</h2>
        <Link href="/canales/proyeccion" className="text-sm text-magenta-700 hover:underline">
          Proyectado vs Real →
        </Link>
      </div>
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {proyeccion.meses.map((punto) => (
          <div key={punto.mes} className="bg-gray-50 rounded-lg p-4 text-center">
            <p className="text-sm text-gray-500 mb-1">{etiqueta(punto.mes)}</p>
            <p className="text-2xl font-bold text-gray-900">{Math.round(punto.hibrido.ventas).toLocaleString('es-AR')}</p>
            <p className="text-sm font-semibold text-magenta-700">{formatearMoneda(Math.round(punto.hibrido.monto))}</p>
            {punto.gocuotas && (
              <p className="text-xs text-gray-400 mt-1">
                s/GOcuotas: {Math.round(punto.gocuotas.ventas).toLocaleString('es-AR')} · {formatearMoneda(Math.round(punto.gocuotas.monto))}
              </p>
            )}
          </div>
        ))}
      </div>
      <p className="text-xs text-gray-400 mt-3">
        Grande: tendencia propia × estacionalidad GOcuotas · gris: creciendo al ritmo de GOcuotas del año pasado · congelado el 1° de cada mes · sin consignatarios
      </p>
    </div>
  )
}
