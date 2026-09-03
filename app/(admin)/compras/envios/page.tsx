import Link from 'next/link'
import { getFacturasEnvios } from '@/lib/actions/envios'
import { fetchAsns, fetchAlertasEnvios, type AsnResumen, type AlertaEnvio, type Rescate, type Siniestro } from '@/lib/gocelular'
import { getSiniestrosCompletos } from '@/lib/actions/siniestros'
import { getRescatesCompletos } from '@/lib/actions/rescates'
import { metaEstado } from '@/lib/rescates'
import { formatearMoneda } from '@/lib/utils'
import EnviosClient from './EnviosClient'
import EnviosTabs from './EnviosTabs'
import CostoCiudad from './CostoCiudad'
import WarehouseAndreani from './WarehouseAndreani'
import AsnTable from './AsnTable'
import AlertasTable from './AlertasTable'
import RescatesTable from './RescatesTable'
import SiniestrosTable from './SiniestrosTable'

export default async function EnviosPage({
  searchParams,
}: {
  searchParams: { tab?: string; provincia?: string }
}) {
  const facturas = await getFacturasEnvios()
  let asns: AsnResumen[] = []
  let alertas: { requierenAtencion: AlertaEnvio[]; expedidosSinImei: AlertaEnvio[] } = { requierenAtencion: [], expedidosSinImei: [] }
  let rescates: Rescate[] = []
  let siniestros: Siniestro[] = []
  try {
    ;[asns, alertas, rescates, siniestros] = await Promise.all([fetchAsns(), fetchAlertasEnvios(), getRescatesCompletos(), getSiniestrosCompletos()])
  } catch {
    // GOcelular no disponible
  }
  const totalAlertas = alertas.requierenAtencion.length + alertas.expedidosSinImei.length
  const rescatesActivos = rescates.filter(r => !metaEstado(r.estado).terminal).length

  return (
    <div className="p-4 md:p-6 max-w-full mx-auto">
      <Link href="/compras" className="text-gray-400 hover:text-gray-600 text-sm">← Compras</Link>
      <h1 className="text-2xl font-bold text-gray-900 mb-1 mt-2">Control de Envíos</h1>
      <p className="text-sm text-gray-500 mb-6">Conciliación de facturas de Andreani contra envíos de GOcelular</p>

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
            </div>
          ),
        },
        {
          id: 'costos',
          label: 'Costo por Ciudad',
          content: <CostoCiudad provincia={searchParams.provincia} />,
        },
        {
          id: 'warehouse',
          label: 'Warehouse Andreani',
          content: <WarehouseAndreani />,
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
          id: 'rescates',
          label: rescatesActivos > 0 ? `Rescates (${rescatesActivos})` : 'Rescates',
          content: <RescatesTable rescates={rescates} />,
        },
        {
          id: 'siniestros',
          label: siniestros.length > 0 ? `Siniestros (${siniestros.length})` : 'Siniestros',
          content: <SiniestrosTable siniestros={siniestros} />,
        },
      ]} />
    </div>
  )
}
