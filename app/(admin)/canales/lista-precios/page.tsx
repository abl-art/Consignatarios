export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { getListaPrecios, getHistorialBonos, getModelosCelulares } from '@/lib/actions/lista-precios-canales'
import ListaPreciosTable from './ListaPreciosTable'
import BonosHistorialTable from './BonosHistorialTable'
import TabsListaBonos from './TabsListaBonos'

export default async function ListaPreciosPage() {
  const [filas, bonos, modelos] = await Promise.all([getListaPrecios(), getHistorialBonos(), getModelosCelulares()])
  const enLista = new Set(filas.map(f => f.productoId))
  const agregables = modelos.filter(m => !enLista.has(m.id))

  return (
    <div className="p-4 md:p-6 max-w-full mx-auto">
      <div className="mb-1">
        <Link href="/canales" className="text-gray-400 hover:text-gray-600 text-sm">&larr; Canales</Link>
      </div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Lista de Precios</h1>
      <p className="text-sm text-gray-500 mb-6">
        Costo sin IVA del proveedor de cada marca × múltiplo = PVP con cuota redonda (÷9 en centenas, siempre para
        arriba). Solo modelos con ventas en los últimos 30 días.
      </p>
      <TabsListaBonos
        cantidadBonos={bonos.length}
        lista={<ListaPreciosTable filas={filas} agregables={agregables} />}
        bonos={<BonosHistorialTable bonos={bonos} />}
      />
    </div>
  )
}
