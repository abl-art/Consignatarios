export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { fetchAuditorias } from '@/lib/actions/auditoria-stock'
import { fetchPeriodosDisponibles, fetchReporteContabilidad } from '@/lib/actions/pase-contabilidad'
import AuditoriaStockClient from '../../auditoria-stock/AuditoriaStockClient'
import PaseContabilidadClient from '../../pase-contabilidad/PaseContabilidadClient'
import FinanzasTabs from '../../finanzas/FinanzasTabs'

export default async function GestionPage() {
  const [auditorias, periodos] = await Promise.all([
    fetchAuditorias(),
    fetchPeriodosDisponibles(),
  ])

  const reporteInicial = periodos.length > 0
    ? await fetchReporteContabilidad(periodos[0])
    : null

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <div className="mb-1">
        <Link href="/inventario" className="text-gray-400 hover:text-gray-600 text-sm">← Inventario</Link>
      </div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Gestión de Inventario</h1>
      <p className="text-sm text-gray-500 mb-6">Control de inventario y pase a contabilidad</p>

      <FinanzasTabs tabs={[
        {
          id: 'control-inventario',
          label: 'Control de Inventario',
          content: <AuditoriaStockClient auditorias={auditorias} />,
        },
        {
          id: 'pase-contabilidad',
          label: 'Pase a Contabilidad',
          content: <PaseContabilidadClient periodos={periodos} reporteInicial={reporteInicial} />,
        },
      ]} />
    </div>
  )
}
