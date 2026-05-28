export const dynamic = 'force-dynamic'

import { getInventarioByCategoria } from '@/lib/actions/compras'
import { getModelosOcultos } from '@/lib/actions/kits-ocultos'
import KitsTable from './KitsTable'

export default async function KitsSeguridadPage() {
  const [items, modelosOcultos] = await Promise.all([
    getInventarioByCategoria('Kits de Seguridad'),
    getModelosOcultos(),
  ])

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Kits de Seguridad</h1>
      <p className="text-sm text-gray-500 mb-6">Inventario de kits recibidos vs ventas realizadas</p>

      <KitsTable items={items} modelosOcultos={modelosOcultos} />
    </div>
  )
}
