export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { fetchCatalogoBuscador } from '@/lib/gocelular'
import { agruparCatalogo, type CatalogoAgrupado } from '@/lib/catalogo-buscador'
import BuscadorCatalogo from './BuscadorCatalogo'
import ReglasCompatibilidad from './ReglasCompatibilidad'

const VALID_TOKEN = 'catalogo2026go'

export default async function CatalogoPage({
  searchParams,
}: {
  searchParams: { token?: string }
}) {
  if (searchParams.token !== VALID_TOKEN) {
    redirect('/login')
  }

  let catalogo: CatalogoAgrupado = { marcas: [], modelos: [] }
  try {
    catalogo = agruparCatalogo(await fetchCatalogoBuscador(), ['Motorola'])
  } catch {
    // GOcelular no disponible: se muestra la página vacía con el aviso del cliente
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-5xl mx-auto">
          <h1 className="text-xl font-bold text-gray-900">GOcelular — ¿Qué equipos se pueden vender?</h1>
          <p className="text-xs text-gray-500">
            Reglas por marca con ejemplos. Ante la duda, buscá el modelo exacto en la lista de abajo.
          </p>
        </div>
      </div>
      <div className="max-w-5xl mx-auto p-6 space-y-8">
        <ReglasCompatibilidad />
        <div>
          <h2 className="text-base font-bold text-gray-900 mb-1">Modelos habilitados hoy</h2>
          <p className="text-xs text-gray-500 mb-4">
            La lista oficial, actualizada desde nuestra base. Si el modelo aparece acá, se vende seguro.
          </p>
          <BuscadorCatalogo catalogo={catalogo} />
        </div>
      </div>
    </div>
  )
}
