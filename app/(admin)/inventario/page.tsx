import Link from 'next/link'
import { fetchStockPropio } from '@/lib/gocelular'

export default async function InventarioPage() {
  const stockCelulares = await fetchStockPropio()

  const categorias = [
    { href: '/inventario/celulares', label: 'Celulares', stock: stockCelulares, color: 'bg-magenta-600', icon: '📱' },
    { href: '/inventario/smartwatches', label: 'Smartwatches', stock: 0, color: 'bg-blue-600', icon: '⌚' },
    { href: '/inventario/parlantes', label: 'Parlantes', stock: 0, color: 'bg-purple-600', icon: '🔊' },
    { href: '/inventario/auriculares', label: 'Auriculares', stock: 0, color: 'bg-cyan-600', icon: '🎧' },
    { href: '/inventario/kits-seguridad', label: 'Kits de Seguridad', stock: 0, color: 'bg-amber-600', icon: '🔒' },
  ]

  const totalStock = categorias.reduce((s, c) => s + c.stock, 0)

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Inventario</h1>
      <p className="text-sm text-gray-500 mb-8">Stock disponible por categoría — {totalStock} unidades totales</p>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {categorias.map(cat => (
          <Link
            key={cat.href}
            href={cat.href}
            className="bg-white border border-gray-200 rounded-xl overflow-hidden hover:shadow-lg transition-shadow group"
          >
            <div className={`${cat.color} px-4 py-3 text-white text-center`}>
              <span className="text-2xl">{cat.icon}</span>
            </div>
            <div className="p-4 text-center">
              <p className="text-3xl font-bold text-gray-900">{cat.stock}</p>
              <p className="text-xs text-gray-500 mt-1">{cat.label}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
