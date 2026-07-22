import Link from 'next/link'

const cards = [
  {
    href: 'https://docs.google.com/document/d/1349pQbzP2-7k77Oe_rS_6h1dA-36la7ZLdZOWmoyKt4/edit?tab=t.0',
    title: 'Procesos',
    description: 'Documentación de procesos operativos de GOcelular',
    color: 'indigo',
    iconPath: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
    external: true,
  },
  {
    href: '/documentacion/flujograma',
    title: 'Flujograma',
    description: 'Mapa de cron jobs: qué corre, cuándo y contra qué',
    color: 'emerald',
    iconPath: 'M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z',
    external: false,
  },
]

const colorClasses: Record<string, { bg: string; badge: string }> = {
  indigo: { bg: 'bg-indigo-600', badge: 'bg-indigo-100 text-indigo-700' },
  emerald: { bg: 'bg-emerald-600', badge: 'bg-emerald-100 text-emerald-700' },
}

export default function DocumentacionPage() {
  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Documentación</h1>
      <p className="text-sm text-gray-500 mb-8">Procesos, diagramas y documentación operativa de GOcelular</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {cards.map((card) => {
          const c = colorClasses[card.color]
          const Tag = card.external ? 'a' : Link
          const extraProps = card.external ? { target: '_blank', rel: 'noopener noreferrer' } : {}
          return (
            <Tag
              key={card.href}
              href={card.href}
              {...extraProps}
              className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-lg transition-shadow group"
            >
              <div className={`${c.bg} px-5 py-4 flex items-center gap-3`}>
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={card.iconPath} />
                </svg>
                <h2 className="text-lg font-semibold text-white">{card.title}</h2>
                {card.external && (
                  <svg className="w-4 h-4 text-white/70 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                )}
              </div>
              <div className="p-5">
                <p className="text-sm text-gray-500">{card.description}</p>
              </div>
            </Tag>
          )
        })}
      </div>
    </div>
  )
}
