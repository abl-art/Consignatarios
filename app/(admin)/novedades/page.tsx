export const dynamic = 'force-dynamic'

import { getNovedades, getNovedadesEnviadas } from '@/lib/actions/novedades'
import FinanzasTabs from '../finanzas/FinanzasTabs'
import NovedadesCard from './NovedadesCard'
import EnviarNovedades from './EnviarNovedades'

export default async function NovedadesPage() {
  const [novedades, enviadas] = await Promise.all([
    getNovedades(100).catch(() => []),
    getNovedadesEnviadas().catch(() => []),
  ])

  return (
    <div className="p-4 md:p-8">
      <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-1">Novedades</h1>
      <p className="text-sm md:text-base text-gray-500 mb-6">Cambios y avisos entre el 360 y el sistema de GOcelular</p>
      <FinanzasTabs
        tabs={[
          { id: 'recibidas', label: 'Recibidas', content: <NovedadesCard novedades={novedades} /> },
          { id: 'enviadas', label: 'Enviadas a GOcelular', content: <EnviarNovedades enviadas={enviadas} /> },
        ]}
      />
    </div>
  )
}
