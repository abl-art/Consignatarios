export const dynamic = 'force-dynamic'

import { getNovedades } from '@/lib/actions/novedades'
import NovedadesCard from './NovedadesCard'

export default async function NovedadesPage() {
  const novedades = await getNovedades(100).catch(() => [])

  return (
    <div className="p-4 md:p-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Novedades</h1>
      <p className="text-sm text-gray-500 mb-6">Cambios y avisos que informa el sistema de GOcelular</p>
      <div className="max-w-3xl">
        <NovedadesCard novedades={novedades} />
      </div>
    </div>
  )
}
