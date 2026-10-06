export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { getListaPrecios, getHistorialBonos, getMargenExtra, getModelosAgregables, getNotasCredito } from '@/lib/actions/lista-precios-canales'
import ListaPreciosTable from './ListaPreciosTable'
import BonosHistorialTable from './BonosHistorialTable'
import NotasCreditoTable from './NotasCreditoTable'
import MargenExtraTable from './MargenExtraTable'
import TabsListaBonos from './TabsListaBonos'

export default async function ListaPreciosPage() {
  const [filas, bonos, modelos, notasCredito, margenExtra] = await Promise.all([
    getListaPrecios(),
    getHistorialBonos(),
    getModelosAgregables(),
    getNotasCredito(),
    getMargenExtra(),
  ])
  const enLista = new Set(filas.map(f => f.productoId))
  const agregables = modelos.filter(m => !enLista.has(m.id))

  return (
    <div className="p-4 md:p-6 max-w-full mx-auto">
      <div className="mb-1">
        <Link href="/canales" className="text-gray-400 hover:text-gray-600 text-sm">&larr; Canales</Link>
      </div>
      <div className="flex items-center gap-3 mb-1">
        <h1 className="text-2xl font-bold text-gray-900">Lista de Precios</h1>
        <a
          href="/canales/lista-precios/manual"
          target="_blank"
          rel="noreferrer"
          className="text-xs font-medium text-violet-700 bg-violet-50 border border-violet-200 rounded-full px-3 py-1 hover:bg-violet-100"
          title="Cómo fijar precios, publicar en tienda, cargar bonos y reclamar NC — con capturas"
        >
          📖 Manual operativo
        </a>
      </div>
      <p className="text-sm text-gray-500 mb-6">
        Costo sin IVA del proveedor de cada marca × múltiplo = PVP con cuota redonda (÷9 en centenas, siempre para
        arriba). Celulares con ventas en los últimos 30 días; tablets y accesorios se suman con &quot;+ Agregar modelo&quot;.
      </p>
      <TabsListaBonos
        cantidadBonos={bonos.length}
        ncPendientes={notasCredito.filter(g => !g.emitida).length}
        lista={<ListaPreciosTable filas={filas} agregables={agregables} />}
        bonos={<BonosHistorialTable bonos={bonos} />}
        notasCredito={<NotasCreditoTable grupos={notasCredito} />}
        margenExtra={<MargenExtraTable devengos={margenExtra} />}
      />
    </div>
  )
}
