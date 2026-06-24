export const dynamic = 'force-dynamic'

import Link from 'next/link'

export default function AfiliadosPage() {
  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <Link
          href="/canales"
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Canales
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Afiliados</h1>
      </div>

      <p className="text-sm text-gray-500 mb-8">Red de afiliados y call center para venta directa al consumidor final</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
      </div>
    </div>
  )
}
