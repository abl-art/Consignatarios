export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

import Link from 'next/link'
import { getProveedores, getProductos, getPedidos, getLineasDisponibles, getLastSyncCheques } from '@/lib/actions/compras'
import PlazoEntrega from './PlazoEntrega'
import ComprasAnalisis from './ComprasAnalisis'
import LineasDisponiblesChart from './LineasDisponiblesChart'

export default async function ComprasPage() {
  const [proveedores, productos, pedidos, lineas, lastSync] = await Promise.all([
    getProveedores(),
    getProductos(),
    getPedidos(),
    getLineasDisponibles(),
    getLastSyncCheques(),
  ])

  const pedidosEnTransito = pedidos.filter(p => p.estado === 'enviado' && !p.entregadoAt)
  const enTransito = pedidosEnTransito.length

  // Resumen por modelo en tránsito
  const transitoPorModelo: Record<string, { cantidad: number; proveedores: Set<string> }> = {}
  for (const ped of pedidosEnTransito) {
    for (const item of ped.items || []) {
      const key = item.productoNombre
      if (!transitoPorModelo[key]) transitoPorModelo[key] = { cantidad: 0, proveedores: new Set() }
      transitoPorModelo[key].cantidad += item.cantidad
      transitoPorModelo[key].proveedores.add(ped.proveedorNombre)
    }
  }
  const transitoModelos = Object.entries(transitoPorModelo)
    .map(([modelo, d]) => ({ modelo, cantidad: d.cantidad, proveedores: Array.from(d.proveedores) }))
    .sort((a, b) => b.cantidad - a.cantidad)

  // Calcular plazos de entrega por proveedor y categoría
  const prodCatMap: Record<string, string> = {}
  productos.forEach((p: { nombre: string; categoria: string }) => { prodCatMap[p.nombre.toLowerCase()] = p.categoria })

  interface PlazoData {
    proveedor: string
    categoria: string
    dias: number
  }
  const plazos: PlazoData[] = []
  for (const p of pedidos) {
    if (!p.confirmadoAt || !p.entregadoAt) continue
    const dias = Math.round((new Date(p.entregadoAt).getTime() - new Date(p.confirmadoAt).getTime()) / (1000 * 60 * 60 * 24))
    // Determinar categoría del pedido por su primer item
    const primerItem = p.items?.[0]
    const cat = primerItem ? (prodCatMap[primerItem.productoNombre?.toLowerCase()] || 'Celulares') : 'Celulares'
    plazos.push({ proveedor: p.proveedorNombre, categoria: cat, dias })
  }

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
      count: enTransito,
      countLabel: 'pedidos en tránsito',
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
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
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

      <LineasDisponiblesChart lineas={lineas} lastSync={lastSync} />

      {/* Resumen en tránsito por modelo */}
      {transitoModelos.length > 0 && (
        <div className="mt-8 bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0" />
              </svg>
              <h3 className="text-sm font-semibold text-gray-900">En tránsito por modelo</h3>
            </div>
            <span className="text-xs text-gray-500">
              {transitoModelos.reduce((s, m) => s + m.cantidad, 0)} unidades en {enTransito} pedidos
            </span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-5 py-2 font-medium text-gray-600">Modelo</th>
                <th className="text-center px-4 py-2 font-medium text-gray-600">Cantidad</th>
                <th className="text-left px-4 py-2 font-medium text-gray-600">Proveedor</th>
              </tr>
            </thead>
            <tbody>
              {transitoModelos.map((m) => (
                <tr key={m.modelo} className="border-b border-gray-100">
                  <td className="px-5 py-2.5 font-medium text-gray-900">{m.modelo}</td>
                  <td className="px-4 py-2.5 text-center">
                    <span className="inline-block px-2 py-0.5 text-xs font-semibold rounded-full bg-blue-100 text-blue-700">
                      {m.cantidad}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-gray-500 text-xs">{m.proveedores.join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Plazo promedio de entrega */}
      {plazos.length > 0 && <PlazoEntrega data={plazos} />}

      {/* Análisis de compras */}
      <ComprasAnalisis pedidos={pedidos} productoCategorias={
        (productos as { nombre: string; categoria: string }[]).reduce<Record<string, string>>((m, p) => { m[p.nombre] = p.categoria; return m }, {})
      } />
    </div>
  )
}
