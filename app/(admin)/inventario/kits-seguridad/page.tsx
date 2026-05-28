export const dynamic = 'force-dynamic'

import { getInventarioByCategoria } from '@/lib/actions/compras'
import { getModelosOcultos } from '@/lib/actions/kits-ocultos'
import { createAdminClient } from '@/lib/supabase/admin'
import KitsTable from './KitsTable'

export default async function KitsSeguridadPage() {
  const admin = createAdminClient()
  const [items, modelosOcultos, { data: cierresData }] = await Promise.all([
    getInventarioByCategoria('Kits de Seguridad'),
    getModelosOcultos(),
    admin
      .from('stock_cierre_mensual')
      .select('periodo, stock_final, precio_unitario, valuacion')
      .eq('categoria', 'kits-seguridad')
      .order('periodo', { ascending: false }),
  ])

  const cierres = (cierresData ?? []).map(r => ({
    periodo: r.periodo,
    stock_final: r.stock_final,
    precio_unitario: r.precio_unitario,
    valuacion: r.valuacion,
  }))

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Kits de Seguridad</h1>
      <p className="text-sm text-gray-500 mb-6">Inventario de kits recibidos vs ventas realizadas</p>

      <KitsTable items={items} modelosOcultos={modelosOcultos} cierres={cierres} />
    </div>
  )
}
