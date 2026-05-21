export const dynamic = 'force-dynamic'

import { fetchActivacionPorMes, fetchPDHardCuota2, fetchAlertasSucursales, fetchAlertasCuota1, fetchAlertasDNI, fetchAlertasTiendaDNI, fetchAlertasSinImei } from '@/lib/gocelular'
import SectionTabs from '@/components/SectionTabs'
import ActivacionTab from './ActivacionTab'
import AlertasTab from './AlertasTab'

export default async function AlertasFraudesPage() {
  const [activacionData, pdData, alertaSucursales, alertaCuota1, dniUsuarios, dniTiendas, sinImei] = await Promise.all([
    fetchActivacionPorMes().catch(() => []),
    fetchPDHardCuota2().catch(() => []),
    fetchAlertasSucursales().catch(() => []),
    fetchAlertasCuota1().catch(() => []),
    fetchAlertasDNI().catch(() => []),
    fetchAlertasTiendaDNI().catch(() => []),
    fetchAlertasSinImei().catch(() => []),
  ])

  const totalSinImei = sinImei.reduce((s, t) => s + t.sinImei, 0)
  const totalAlertas = alertaSucursales.length + alertaCuota1.length + dniUsuarios.length + dniTiendas.length + totalSinImei

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Alertas y Fraudes</h1>
      <p className="text-sm text-gray-500 mb-6">Monitoreo de activacion, deteccion de anomalias y control de fraudes</p>

      <SectionTabs
        tabs={[
          { id: 'alertas', label: `Alertas (${totalAlertas})`, content: <AlertasTab sucursales={alertaSucursales} cuota1={alertaCuota1} dniUsuarios={dniUsuarios} dniTiendas={dniTiendas} sinImei={sinImei} /> },
          { id: 'activacion', label: 'Tasa de Activacion', content: <ActivacionTab data={activacionData} pdData={pdData} /> },
        ]}
      />
    </div>
  )
}
