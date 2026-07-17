import Link from 'next/link'

export default function ClientesMayoristasPage() {
  const cards = [
    {
      href: '/mayoristas/clientes/listado',
      title: 'Listado de Clientes',
      description: 'Crear y gestionar clientes mayoristas',
      color: 'indigo',
      iconPath: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z',
    },
    {
      href: '/mayoristas/clientes/cuenta-corriente',
      title: 'Cuenta Corriente',
      description: 'Debe, haber y saldo por cliente',
      color: 'emerald',
      iconPath: 'M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z',
    },
    {
      href: '/mayoristas/clientes/pagos',
      title: 'Pagos',
      description: 'Registrar pagos y cancelaciones',
      color: 'blue',
      iconPath: 'M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z',
    },
  ]

  const colorClasses: Record<string, { bg: string; badge: string }> = {
    indigo: { bg: 'bg-indigo-600', badge: 'bg-indigo-100 text-indigo-700' },
    emerald: { bg: 'bg-emerald-600', badge: 'bg-emerald-100 text-emerald-700' },
    blue: { bg: 'bg-blue-600', badge: 'bg-blue-100 text-blue-700' },
  }

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Clientes Mayoristas</h1>
      <p className="text-sm text-gray-500 mb-8">Gestión de clientes, cuenta corriente y pagos</p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {cards.map((card) => {
          const c = colorClasses[card.color]
          return (
            <Link
              key={card.title}
              href={card.href}
              className="bg-white rounded-xl border border-gray-200 overflow-hidden transition-shadow group hover:shadow-lg"
            >
              <div className={`${c.bg} px-5 py-4 flex items-center gap-3`}>
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={card.iconPath} />
                </svg>
                <h2 className="text-lg font-semibold text-white">{card.title}</h2>
              </div>
              <div className="p-5">
                <p className="text-sm text-gray-500 mb-4">{card.description}</p>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
