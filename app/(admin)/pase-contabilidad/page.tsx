export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { fetchPeriodosDisponibles, fetchReporteContabilidad } from '@/lib/actions/pase-contabilidad'
import PaseContabilidadClient from './PaseContabilidadClient'

export default async function PaseContabilidadPage() {
  const periodos = await fetchPeriodosDisponibles()
  const reporteInicial = periodos.length > 0
    ? await fetchReporteContabilidad(periodos[0])
    : null

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <div className="mb-1">
        <Link href="/inventario" className="text-gray-400 hover:text-gray-600 text-sm">← Inventario</Link>
      </div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Pase a Contabilidad</h1>
      <p className="text-sm text-gray-500 mb-6">
        Reporte mensual de existencias finales para contabilidad y calculo de costo de ventas.
      </p>

      <PaseContabilidadClient periodos={periodos} reporteInicial={reporteInicial} />
    </div>
  )
}
