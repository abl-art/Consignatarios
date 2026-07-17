export const dynamic = 'force-dynamic'

import Link from 'next/link'

export default function AfiliadosPage() {
  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <Link href="/canales" className="text-gray-400 hover:text-gray-600 text-sm">← Canales</Link>
      <h1 className="text-2xl font-bold text-gray-900 mb-1 mt-2">Afiliados</h1>
      <p className="text-sm text-gray-500 mb-6">Red de afiliados y call center para venta directa al consumidor final</p>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Link
          href="/canales/afiliados/guia"
          className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-lg transition-shadow"
        >
          <div className="bg-purple-600 px-5 py-4 flex items-center gap-3">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
            <h2 className="text-lg font-semibold text-white">Guía Comercial</h2>
          </div>
          <div className="p-5">
            <p className="text-sm text-gray-500">Manual para supervisores de call center: productos, financiación, preguntas frecuentes y manejo de objeciones</p>
          </div>
        </Link>

        <Link
          href="/canales/afiliados/desempeno"
          className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-lg transition-shadow"
        >
          <div className="bg-emerald-600 px-5 py-4 flex items-center gap-3">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <h2 className="text-lg font-semibold text-white">Desempeño</h2>
          </div>
          <div className="p-5">
            <p className="text-sm text-gray-500">Métricas de conversión, revenue y comisiones de la red de afiliados</p>
          </div>
        </Link>

        <Link
          href="/canales/afiliados/liquidaciones"
          className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-lg transition-shadow"
        >
          <div className="bg-blue-600 px-5 py-4 flex items-center gap-3">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" />
            </svg>
            <h2 className="text-lg font-semibold text-white">Liquidaciones</h2>
          </div>
          <div className="p-5">
            <p className="text-sm text-gray-500">Liquidaciones mensuales de comisiones por afiliado</p>
          </div>
        </Link>

        <Link
          href="/canales/afiliados/links"
          className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-lg transition-shadow"
        >
          <div className="bg-amber-600 px-5 py-4 flex items-center gap-3">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
            <h2 className="text-lg font-semibold text-white">Links</h2>
          </div>
          <div className="p-5">
            <p className="text-sm text-gray-500">Links para compartir a cada afiliado su portal de liquidaciones</p>
          </div>
        </Link>
      </div>
    </div>
  )
}
