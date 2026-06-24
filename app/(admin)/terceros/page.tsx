export const dynamic = 'force-dynamic'

import Link from 'next/link'

export default function TercerosPage() {
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
        <h1 className="text-2xl font-bold text-gray-900">Venta a Terceros</h1>
      </div>

      <p className="text-sm text-gray-500 mb-8">Merchants externos que venden con la plataforma GOcuotas</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
            <p className="text-sm text-gray-500">Gestión de terceros, seguimiento comercial y estados de cuenta</p>
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
      </div>
    </div>
  )
}
