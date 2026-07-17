import Link from 'next/link'
import { getForecastEvents, getComprasDias } from '@/lib/actions/finanzas'
import ComprasTab from '../ComprasTab'

export default async function ComprasPage() {
  const [events, dias] = await Promise.all([
    getForecastEvents(),
    getComprasDias(),
  ])

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <div className="mb-1">
        <Link href="/inventario" className="text-gray-400 hover:text-gray-600 text-sm">← Inventario</Link>
        <span className="text-gray-300 text-sm mx-1">/</span>
        <Link href="/inventario/celulares" className="text-gray-400 hover:text-gray-600 text-sm">← Celulares</Link>
      </div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Compras</h1>
      <p className="text-sm text-gray-500 mb-6">Recomendación de compras basada en forecast de ventas</p>

      <ComprasTab apiUrl="https://gocelular-forecast-production.up.railway.app" events={events} dias={dias} />
    </div>
  )
}
