export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { fetchCatalogoBuscador } from '@/lib/gocelular'
import { agruparCatalogo, type CatalogoAgrupado } from '@/lib/catalogo-buscador'
import BuscadorCatalogo from './BuscadorCatalogo'

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
    catalogo = agruparCatalogo(await fetchCatalogoBuscador())
  } catch {
    // GOcelular no disponible: se muestra la página vacía con el aviso del cliente
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-xl font-bold text-gray-900">GOcelular — Teléfonos habilitados</h1>
          <p className="text-xs text-gray-500">
            Si aparece en este listado, se puede vender con GOcelular.
          </p>
        </div>
      </div>
      <div className="max-w-3xl mx-auto p-6">
        <BuscadorCatalogo catalogo={catalogo} />
      </div>
    </div>
  )
}
