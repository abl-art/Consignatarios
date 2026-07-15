import Link from 'next/link'

export default function ClientesMayoristasPage() {
  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-8">Clientes Mayoristas</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Link href="/mayoristas/clientes/listado"
          className="bg-white border border-gray-200 rounded-xl p-6 hover:shadow-md transition-shadow">
          <div className="text-3xl mb-3">👥</div>
          <h2 className="text-lg font-semibold text-gray-900 mb-1">Listado de Clientes</h2>
          <p className="text-sm text-gray-500">Crear y gestionar clientes mayoristas</p>
        </Link>

        <div className="bg-white border border-gray-200 rounded-xl p-6 opacity-60">
          <div className="text-3xl mb-3">📒</div>
          <h2 className="text-lg font-semibold text-gray-900 mb-1">Cuenta Corriente</h2>
          <p className="text-sm text-gray-400">Próximamente</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-6 opacity-60">
          <div className="text-3xl mb-3">💳</div>
          <h2 className="text-lg font-semibold text-gray-900 mb-1">Pagos</h2>
          <p className="text-sm text-gray-400">Próximamente</p>
        </div>
      </div>
    </div>
  )
}
