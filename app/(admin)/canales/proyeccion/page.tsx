export const dynamic = 'force-dynamic'
export const maxDuration = 60

import Link from 'next/link'
import { getProyeccionInicial } from '@/lib/actions/proyecciones'
import { getFiltrosTerceros } from '@/lib/actions/finanzas'
import ProyeccionClient from './ProyeccionClient'

export default async function ProyeccionPage() {
  const [inicial, merchants] = await Promise.all([getProyeccionInicial(), getFiltrosTerceros()])

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <div className="flex items-center gap-2 mb-1">
        <Link href="/canales" className="text-sm text-gray-400 hover:text-gray-600">
          Canales
        </Link>
        <span className="text-sm text-gray-300">/</span>
        <h1 className="text-2xl font-bold text-gray-900">Proyección de Ventas</h1>
      </div>
      <p className="text-sm text-gray-500 mb-6">
        Proyectado vs Real por mes — método híbrido (tendencia propia × estacionalidad GOcuotas) y método GOcuotas (creciendo al
        ritmo de la plataforma del año pasado), congelados el 1° de cada mes
      </p>

      {!inicial ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-sm text-gray-500">
          Todavía no hay proyecciones congeladas. El primer run se genera con el cron mensual (día 1) o manualmente.
        </div>
      ) : (
        <ProyeccionClient inicial={inicial} merchants={merchants} />
      )}
    </div>
  )
}
