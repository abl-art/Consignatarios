export const dynamic = 'force-dynamic'

import Link from 'next/link'

const canales = [
  {
    href: 'https://gocelular.gocuotas.com/tienda',
    title: 'Tienda Online',
    description: 'Ecommerce directo al consumidor con financiación GOcuotas',
    color: 'emerald',
    external: true,
    iconPath: 'M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z',
  },
  {
    href: '/terceros',
    title: 'Venta a Terceros',
    description: 'Merchants externos que venden con la plataforma GOcuotas',
    color: 'blue',
    iconPath: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4',
  },
  {
    href: '/canales/afiliados',
    title: 'Afiliados',
    description: 'Red de afiliados y call center para venta directa',
    color: 'purple',
    iconPath: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z',
  },
  {
    href: '/consignatarios',
    title: 'Consignatarios',
    description: 'Stock en consignación en locales de terceros',
    color: 'amber',
    iconPath: 'M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z',
  },
]

const colorClasses: Record<string, { bg: string; badge: string }> = {
  emerald: { bg: 'bg-emerald-600', badge: 'bg-emerald-100 text-emerald-700' },
  blue: { bg: 'bg-blue-600', badge: 'bg-blue-100 text-blue-700' },
  purple: { bg: 'bg-purple-600', badge: 'bg-purple-100 text-purple-700' },
  amber: { bg: 'bg-amber-600', badge: 'bg-amber-100 text-amber-700' },
}

export default function CanalesPage() {
  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Canales de Comercialización</h1>
      <p className="text-sm text-gray-500 mb-8">Todos los canales de venta de GOcelular</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {canales.map((canal) => {
          const c = colorClasses[canal.color]
          const Tag = canal.external ? 'a' : Link
          const extraProps = canal.external ? { target: '_blank', rel: 'noopener noreferrer' } : {}
          return (
            <Tag
              key={canal.href}
              href={canal.href}
              {...extraProps as Record<string, string>}
              className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-lg transition-shadow group"
            >
              <div className={`${c.bg} px-5 py-4 flex items-center gap-3`}>
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={canal.iconPath} />
                </svg>
                <h2 className="text-lg font-semibold text-white">{canal.title}</h2>
                {canal.external && (
                  <svg className="w-4 h-4 text-white/60 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                )}
              </div>
              <div className="p-5">
                <p className="text-sm text-gray-500">{canal.description}</p>
              </div>
            </Tag>
          )
        })}
      </div>
    </div>
  )
}
