export const dynamic = 'force-dynamic'

import Link from 'next/link'

const cards = [
  {
    href: '/mayoristas/clientes',
    title: 'Clientes',
    description: 'Listado de clientes, cuenta corriente y pagos',
    color: 'indigo',
    iconPath: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z',
  },
  {
    href: '/mayoristas/proformas',
    title: 'Proformas',
    description: 'Crear y gestionar proformas de venta mayorista',
    color: 'emerald',
    iconPath: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
  },
  {
    href: '/mayoristas/asignaciones',
    title: 'Asignaciones',
    description: 'Preparar y despachar equipos vendidos a mayoristas',
    color: 'blue',
    iconPath: 'M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4',
  },
  {
    href: '/mayoristas/lista-precios',
    title: 'Lista de Precios',
    description: 'Precios mayoristas vigentes por modelo',
    color: 'amber',
    iconPath: 'M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z',
  },
]

const colorClasses: Record<string, { bg: string }> = {
  indigo: { bg: 'bg-indigo-600' },
  emerald: { bg: 'bg-emerald-600' },
  blue: { bg: 'bg-blue-600' },
  amber: { bg: 'bg-amber-600' },
}

export default function MayoristasHubPage() {
  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <Link href="/canales" className="text-gray-400 hover:text-gray-600 text-sm">← Canales</Link>
      <h1 className="text-2xl font-bold text-gray-900 mb-1 mt-2">Mayoristas</h1>
      <p className="text-sm text-gray-500 mb-6">Venta mayorista con proformas y cuenta corriente</p>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {cards.map((card) => {
          const c = colorClasses[card.color]
          return (
            <Link
              key={card.href}
              href={card.href}
              className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-lg transition-shadow"
            >
              <div className={`${c.bg} px-5 py-4 flex items-center gap-3`}>
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={card.iconPath} />
                </svg>
                <h2 className="text-lg font-semibold text-white">{card.title}</h2>
              </div>
              <div className="p-5">
                <p className="text-sm text-gray-500">{card.description}</p>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
