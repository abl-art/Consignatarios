import Link from 'next/link'
import { getProveedores, getProductos } from '@/lib/actions/compras'

export default async function ComprasPage() {
  const [proveedores, productos] = await Promise.all([
    getProveedores(),
    getProductos(),
  ])

  const cards = [
    {
      href: '/compras/proveedores',
      title: 'Proveedores',
      description: 'Gestionar proveedores, contactos y datos fiscales',
      count: proveedores.length,
      countLabel: 'proveedores registrados',
      color: 'indigo',
      iconPath: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4',
    },
    {
      href: '/compras/modelos',
      title: 'Modelos y Precios',
      description: 'Catálogo de productos y precios por proveedor',
      count: productos.length,
      countLabel: 'productos en catálogo',
      color: 'emerald',
      iconPath: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4',
    },
    {
      href: '/compras/gestor',
      title: 'Gestor de Pedidos',
      description: 'Crear pedidos, generar notas y enviar a proveedores',
      count: 0,
      countLabel: 'pedidos activos',
      color: 'blue',
      iconPath: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01',
    },
  ]

  const colorClasses: Record<string, { bg: string; text: string; border: string; badge: string }> = {
    indigo: { bg: 'bg-indigo-600', text: 'text-indigo-600', border: 'border-indigo-200', badge: 'bg-indigo-100 text-indigo-700' },
    emerald: { bg: 'bg-emerald-600', text: 'text-emerald-600', border: 'border-emerald-200', badge: 'bg-emerald-100 text-emerald-700' },
    blue: { bg: 'bg-blue-600', text: 'text-blue-600', border: 'border-blue-200', badge: 'bg-blue-100 text-blue-700' },
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Compras</h1>
      <p className="text-sm text-gray-500 mb-8">Gestión de proveedores, productos y pedidos de compra</p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {cards.map((card) => {
          const c = colorClasses[card.color]
          return (
            <Link
              key={card.href}
              href={card.href}
              className={`bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-lg transition-shadow group`}
            >
              <div className={`${c.bg} px-5 py-4 flex items-center gap-3`}>
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={card.iconPath} />
                </svg>
                <h2 className="text-lg font-semibold text-white">{card.title}</h2>
              </div>
              <div className="p-5">
                <p className="text-sm text-gray-500 mb-4">{card.description}</p>
                <span className={`inline-block px-3 py-1 text-xs font-semibold rounded-full ${c.badge}`}>
                  {card.count} {card.countLabel}
                </span>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
