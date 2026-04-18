import { getForecastEvents, getComprasDias } from '@/lib/actions/finanzas'
import ComprasTab from '../ComprasTab'

export default async function ComprasPage() {
  const [events, dias] = await Promise.all([
    getForecastEvents(),
    getComprasDias(),
  ])

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Compras</h1>
      <p className="text-sm text-gray-500 mb-6">Recomendación de compras basada en forecast de ventas</p>

      <ComprasTab apiUrl="https://gocelular-forecast-production.up.railway.app" events={events} dias={dias} />
    </div>
  )
}
