import Link from 'next/link'
import { getFacturasEnvios } from '@/lib/actions/envios'
import { getFacturasWarehouse } from '@/lib/actions/warehouse-factura'
import { fetchAsns, fetchAlertasEnvios, fetchProductosStock, fetchDemorasEntrega, type AsnResumen, type AlertaEnvio, type Rescate, type Siniestro, type ProductoStock } from '@/lib/gocelular'
import type { DemoraEntrega } from '@/lib/demoras'
import { getSiniestrosStock } from '@/lib/actions/siniestros-stock'
import type { SiniestroStock } from '@/lib/siniestros-stock'
import { getCortesControlStock, type CorteControlStock } from '@/lib/actions/control-stock'
import { netoPorModelo } from '@/lib/control-stock'
import { getSiniestrosCompletos } from '@/lib/actions/siniestros'
import { getRescatesCompletos } from '@/lib/actions/rescates'
import { getArrepentimientos, type SolicitudArrepentimiento } from '@/lib/actions/arrepentimientos'
import { getDemorasDescartadas } from '@/lib/actions/demoras'
import { metaEstado } from '@/lib/rescates'
import { formatearMoneda } from '@/lib/utils'
import type { FuentesBusqueda } from '@/lib/buscador-envios'
import EnviosClient from './EnviosClient'
import EnviosTabs from './EnviosTabs'
import BuscadorEnvios from './BuscadorEnvios'
import CostosResumen from './CostosResumen'
import WarehouseFacturaUpload from './WarehouseFacturaUpload'
import FacturasWarehouseTable from './FacturasWarehouseTable'
import WarehouseAndreani from './WarehouseAndreani'
import AsnTable from './AsnTable'
import ControlStockTable from './ControlStockTable'
import AlertasTable from './AlertasTable'
import RescatesTable from './RescatesTable'
import ArrepentimientosTable from './ArrepentimientosTable'
import DemorasTable from './DemorasTable'
import SiniestrosTable from './SiniestrosTable'
import SiniestrosStockTable from './SiniestrosStockTable'

export default async function EnviosPage({
  searchParams,
}: {
  searchParams: { tab?: string }
}) {
  const [facturas, facturasWarehouse] = await Promise.all([getFacturasEnvios(), getFacturasWarehouse()])
  let asns: AsnResumen[] = []
  let alertas: { requierenAtencion: AlertaEnvio[]; expedidosSinImei: AlertaEnvio[] } = { requierenAtencion: [], expedidosSinImei: [] }
  let rescates: Rescate[] = []
  let siniestros: Siniestro[] = []
  let productosStock: ProductoStock[] = []
  let demoras: DemoraEntrega[] = []
  try {
    ;[asns, alertas, rescates, siniestros, productosStock] = await Promise.all([
      fetchAsns(),
      fetchAlertasEnvios(),
      getRescatesCompletos(),
      getSiniestrosCompletos(),
      fetchProductosStock(),
    ])
    // Después de rescates: sus trackings (incluidos los cargados a mano) se
    // excluyen de Demoras, igual que los descartes manuales (verificados
    // entregados en Andreani pese a traces congelados)
    const descartadas = await getDemorasDescartadas().catch(() => new Set<string>())
    const excluir = new Set(rescates.map(r => r.tracking).filter((t): t is string => Boolean(t)))
    for (const s of siniestros) if (s.tracking) excluir.add(s.tracking) // incluye los cargados a mano
    for (const t of descartadas) excluir.add(t)
    demoras = await fetchDemorasEntrega(new Date(), excluir)
  } catch {
    // GOcelular no disponible
  }
  // Siniestros de almacenamiento (Supabase — no depende de GOcelular)
  const siniestrosStock: SiniestroStock[] = await getSiniestrosStock().catch(() => [])
  // Cola del Botón de Arrepentimiento (Supabase — no depende de GOcelular)
  const arrepentimientos: SolicitudArrepentimiento[] = await getArrepentimientos().catch(() => [])
  const arrepPendientes = arrepentimientos.filter(a => a.estado === 'pendiente').length
  // Cortes del control de stock (Supabase — no depende de GOcelular)
  const cortesControlStock: CorteControlStock[] = await getCortesControlStock().catch(() => [])
  const totalAlertas = alertas.requierenAtencion.length + alertas.expedidosSinImei.length
  const siniestrosWhAbiertos = siniestrosStock.filter(s => s.estado === 'abierto').length
  const rescatesActivos = rescates.filter(r => !metaEstado(r.estado).terminal).length
  const modelosConDif = cortesControlStock[0]
    ? netoPorModelo(cortesControlStock[0].filas, cortesControlStock[0].enCola).filter(m => m.dif !== 0).length
    : 0

  // Índice liviano para el buscador transversal: solo los campos que usa,
  // armado con los datos ya fetcheados (sin queries extra)
  const fuentesBusqueda: FuentesBusqueda = {
    alertas: [...alertas.requierenAtencion, ...alertas.expedidosSinImei].map(a => ({
      orderNumber: a.orderNumber, cliente: a.cliente, dni: a.dni, tracking: a.tracking,
      producto: a.producto, razon: a.razon, diasPendiente: a.diasPendiente,
    })),
    demoras: demoras.map(d => ({
      orderNumber: d.orderNumber, cliente: d.cliente, dni: d.dni, tracking: d.tracking,
      producto: d.producto, metodo: d.metodo, diasDemora: d.diasDemora,
    })),
    arrepentimientos: arrepentimientos.map(s => ({
      id: s.id, nombre: s.nombre, dni: s.dni, orderNumber: s.orderNumber, tracking: s.tracking,
      producto: s.producto, estado: s.estado, fulfillment: s.fulfillment,
    })),
    rescates: rescates.map(r => ({
      orderNumber: r.orderNumber, cliente: r.cliente, dni: r.dni, tracking: r.tracking,
      producto: r.producto, estado: r.estado, motivo: r.motivo,
    })),
    siniestros: siniestros.map(s => ({
      orderNumber: s.orderNumber, cliente: s.cliente, dni: s.dni, tracking: s.tracking,
      producto: s.producto, notaCredito: s.notaCredito, dias: s.dias,
    })),
    siniestrosWh: siniestrosStock.map(w => ({
      id: w.id, producto: w.producto, imei: w.imei, tipo: w.tipo, estado: w.estado, notaCredito: w.notaCredito,
    })),
  }

  return (
    <div className="p-4 md:p-6 max-w-full mx-auto">
      <Link href="/compras" className="text-gray-400 hover:text-gray-600 text-sm">← Compras</Link>
      <div className="flex items-center gap-3 mb-1 mt-2">
        <h1 className="text-2xl font-bold text-gray-900">Control de Envíos</h1>
        <a
          href="/compras/envios/manual"
          target="_blank"
          rel="noreferrer"
          className="text-xs font-medium text-violet-700 bg-violet-50 border border-violet-200 rounded-full px-3 py-1 hover:bg-violet-100"
          title="Arrepentimientos, Rescates y Siniestros: qué es cada pestaña y cómo se usa — con capturas"
        >
          📖 Manual operativo
        </a>
      </div>
      <p className="text-sm text-gray-500 mb-6">Conciliación de facturas de Andreani contra envíos de GOcelular</p>

      <BuscadorEnvios fuentes={fuentesBusqueda} />

      <EnviosTabs tabs={[
        {
          id: 'carga',
          label: 'Carga de Factura',
          content: (
            <div>
              <EnviosClient />

              {facturas.length > 0 && (
                <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="text-left px-6 py-3 font-medium text-gray-600">Nro. Legal</th>
                        <th className="text-left px-6 py-3 font-medium text-gray-600">Fecha</th>
                        <th className="text-left px-6 py-3 font-medium text-gray-600">Período</th>
                        <th className="text-right px-6 py-3 font-medium text-gray-600">Envíos</th>
                        <th className="text-right px-6 py-3 font-medium text-gray-600">Total facturado</th>
                        <th className="text-right px-6 py-3 font-medium text-gray-600">Conciliados</th>
                        <th className="text-right px-6 py-3 font-medium text-gray-600">Sobrantes</th>
                        <th className="text-right px-6 py-3 font-medium text-gray-600">Monto sobrante</th>
                        <th className="px-6 py-3"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {facturas.map((f) => {
                        const tieneProblemas = f.envios_sobrantes > 0
                        return (
                          <tr key={f.id} className="hover:bg-gray-50">
                            <td className="px-6 py-3 font-medium text-gray-900">{f.nro_legal}</td>
                            <td className="px-6 py-3 text-gray-600">
                              {new Date(f.fecha_comprobante).toLocaleDateString('es-AR')}
                            </td>
                            <td className="px-6 py-3 text-gray-600">
                              {new Date(f.fecha_desde).toLocaleDateString('es-AR')} — {new Date(f.fecha_hasta).toLocaleDateString('es-AR')}
                            </td>
                            <td className="px-6 py-3 text-right text-gray-900">{f.total_envios}</td>
                            <td className="px-6 py-3 text-right text-gray-900">{formatearMoneda(f.total_facturado)}</td>
                            <td className="px-6 py-3 text-right text-green-700 font-medium">{f.envios_conciliados}</td>
                            <td className="px-6 py-3 text-right">
                              <span className={tieneProblemas ? 'text-red-600 font-semibold' : 'text-gray-500'}>
                                {f.envios_sobrantes}
                              </span>
                            </td>
                            <td className="px-6 py-3 text-right">
                              <span className={tieneProblemas ? 'text-red-600 font-semibold' : 'text-gray-500'}>
                                {f.monto_sobrante > 0 ? formatearMoneda(f.monto_sobrante) : '—'}
                              </span>
                            </td>
                            <td className="px-6 py-3 text-right">
                              <Link href={`/compras/envios/${f.id}`}
                                className="text-magenta-600 hover:text-magenta-800 text-xs font-medium">
                                Ver detalle →
                              </Link>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="mt-8">
                <WarehouseFacturaUpload />
                <FacturasWarehouseTable facturas={facturasWarehouse} />
              </div>
            </div>
          ),
        },
        {
          id: 'costos',
          label: 'Costos',
          content: <CostosResumen />,
        },
        {
          id: 'warehouse',
          label: 'Warehouse Andreani',
          content: <WarehouseAndreani />,
        },
        {
          id: 'control-stock',
          label: modelosConDif > 0 ? `Control Stock (${modelosConDif})` : 'Control Stock',
          content: <ControlStockTable cortes={cortesControlStock} />,
        },
        {
          id: 'asn',
          label: 'ASN',
          content: <AsnTable asns={asns} />,
        },
        {
          id: 'alertas',
          label: totalAlertas > 0 ? `Alertas (${totalAlertas})` : 'Alertas',
          content: <AlertasTable requierenAtencion={alertas.requierenAtencion} expedidosSinImei={alertas.expedidosSinImei} />,
        },
        {
          id: 'demoras',
          label: demoras.length > 0 ? `Demoras de entrega (${demoras.length})` : 'Demoras de entrega',
          content: <DemorasTable demoras={demoras} />,
        },
        {
          id: 'arrepentimientos',
          label: arrepPendientes > 0 ? `Arrepentimientos (${arrepPendientes})` : 'Arrepentimientos',
          content: <ArrepentimientosTable solicitudes={arrepentimientos} />,
        },
        {
          id: 'rescates',
          label: rescatesActivos > 0 ? `Rescates (${rescatesActivos})` : 'Rescates',
          content: <RescatesTable rescates={rescates} />,
        },
        {
          id: 'siniestros',
          label: siniestros.length > 0 ? `Siniestros Distribución (${siniestros.length})` : 'Siniestros Distribución',
          content: <SiniestrosTable siniestros={siniestros} />,
        },
        {
          id: 'siniestros-warehouse',
          label: siniestrosWhAbiertos > 0 ? `Siniestros Warehouse (${siniestrosWhAbiertos})` : 'Siniestros Warehouse',
          content: <SiniestrosStockTable siniestros={siniestrosStock} productos={productosStock} />,
        },
      ]} />
    </div>
  )
}
