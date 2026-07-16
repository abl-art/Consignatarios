export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { obtenerTodosLosAfiliados } from '@/lib/actions/liquidaciones-afiliados'
import { CopiarLinkButton } from './CopiarLinkButton'

export default async function LinksAfiliadosPage() {
  const afiliados = await obtenerTodosLosAfiliados()

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <Link
          href="/canales/afiliados"
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Afiliados
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Links de Liquidaciones</h1>
      </div>
      <p className="text-sm text-gray-500 mb-8">
        Compartí estos links con cada afiliado para que vean sus liquidaciones y suban su factura.
      </p>

      {afiliados.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
          <p className="text-gray-400 text-sm">No se encontraron afiliados.</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Afiliado</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Link</th>
                <th className="px-6 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {afiliados.map((a) => (
                <tr key={a.slug} className="hover:bg-gray-50">
                  <td className="px-6 py-4 font-medium text-gray-900">{a.display_name}</td>
                  <td className="px-6 py-4 text-gray-500 text-xs font-mono">
                    /afiliados/{a.slug}/liquidaciones
                  </td>
                  <td className="px-6 py-4 text-right">
                    <CopiarLinkButton slug={a.slug} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
