import Link from 'next/link'

export default function GrupoGoPage() {
  const cards = [
    {
      href: '/grupo-go/dashboard',
      title: 'Dashboard',
      description: 'Operaciones por modelo de negocio del Grupo GO',
      color: 'indigo',
      iconPath: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
      external: false,
    },
    {
      href: 'https://finanzas.gocuotas.com',
      title: 'Finanzas',
      description: 'Panel financiero del Grupo GO en GOcuotas',
      color: 'emerald',
      iconPath: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
      external: true,
    },
  ]

  const colorClasses: Record<string, { bg: string; badge: string }> = {
    indigo: { bg: 'bg-indigo-600', badge: 'bg-indigo-100 text-indigo-700' },
    emerald: { bg: 'bg-emerald-600', badge: 'bg-emerald-100 text-emerald-700' },
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Grupo GO</h1>
      <p className="text-sm text-gray-500 mb-6">Indicadores del grupo económico GOcuotas</p>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {cards.map((card) => {
          const c = colorClasses[card.color]
          const Tag = card.external ? 'a' : Link
          const extraProps = card.external ? { target: '_blank', rel: 'noopener noreferrer' } : {}
          return (
            <Tag
              key={card.href}
              href={card.href}
              className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-lg transition-shadow group"
              {...extraProps}
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
