export const dynamic = 'force-dynamic'
export const maxDuration = 60

import Link from 'next/link'
import { fetchInventarioResumen } from '@/lib/actions/inventario-resumen'
import { getProyeccionPropiaRun } from '@/lib/actions/proyecciones'
import ForecastClient from './ForecastClient'

export default async function ForecastComprasPage() {
  const [inventario, proyeccion] = await Promise.all([fetchInventarioResumen(), getProyeccionPropiaRun()])

  const celulares = inventario.productos.find((p) => p.key === 'celulares')?.modelos ?? []
  // Addons = accesorios con venta propia; los kits quedan afuera (se regalan,
  // siguen con la cobertura de Inventario)
  const addons = inventario.productos
    .filter((p) => p.key === 'smartwatches' || p.key === 'parlantes' || p.key === 'auriculares')
    .flatMap((p) => p.modelos)

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <div className="flex items-center gap-2 mb-1">
        <Link href="/compras" className="text-sm text-gray-400 hover:text-gray-600">
          Compras
        </Link>
        <span className="text-sm text-gray-300">/</span>
        <h1 className="text-2xl font-bold text-gray-900">Forecast de Compras</h1>
      </div>
      <p className="text-sm text-gray-500 mb-6">
        Compra sugerida por modelo: el mix de ventas propias de 30 días escala con la proyección congelada de venta propia y se
        netea contra el pipeline actual (disponible + tránsito + pedidos)
      </p>

      {!proyeccion ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-sm text-gray-500">
          Todavía no hay un run de proyecciones congelado — el forecast necesita la proyección de venta propia.
        </div>
      ) : (
        <ForecastClient
          celulares={celulares.map((m) => ({ modelo: m.modelo, stock: m.stock, ventaDiaria30: m.ventaDiaria30 }))}
          addons={addons.map((m) => ({ modelo: m.modelo, stock: m.stock, ventaDiaria30: m.ventaDiaria30 }))}
          reposiciones={inventario.reposiciones}
          proyeccion={proyeccion}
        />
      )}
    </div>
  )
}
