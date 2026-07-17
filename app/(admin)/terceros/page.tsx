export const dynamic = 'force-dynamic'

import Link from 'next/link'

export default function TercerosPage() {
  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <Link href="/canales" className="text-gray-400 hover:text-gray-600 text-sm">← Canales</Link>
      <h1 className="text-2xl font-bold text-gray-900 mb-1 mt-2">Venta a Terceros</h1>
      <p className="text-sm text-gray-500 mb-6">Merchants externos que venden con la plataforma GOcuotas</p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Link
          href="/terceros/crm"
          className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-lg transition-shadow"
        >
          <div className="bg-blue-600 px-5 py-4 flex items-center gap-3">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <h2 className="text-lg font-semibold text-white">CRM</h2>
          </div>
          <div className="p-5">
            <p className="text-sm text-gray-500">Pipeline GOcelulares — seguimiento comercial, conversión y reuniones</p>
          </div>
        </Link>

        <Link
          href="/terceros/altas"
          className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-lg transition-shadow"
        >
          <div className="bg-emerald-600 px-5 py-4 flex items-center gap-3">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h2 className="text-lg font-semibold text-white">Altas</h2>
          </div>
          <div className="p-5">
            <p className="text-sm text-gray-500">Terceros activos con ventas del mes y resumen de operaciones</p>
          </div>
        </Link>

        <a
          href="https://keycontact.vercel.app/inicio"
          target="_blank"
          rel="noopener noreferrer"
          className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-lg transition-shadow"
        >
          <div className="bg-purple-600 px-5 py-4 flex items-center gap-3">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            <h2 className="text-lg font-semibold text-white">KEYcontact</h2>
          </div>
          <div className="p-5">
            <p className="text-sm text-gray-500">Acceder al CRM de KEYcontact</p>
          </div>
        </a>
      </div>
    </div>
  )
}
