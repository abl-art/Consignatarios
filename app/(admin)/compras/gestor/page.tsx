export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { getProductos, getProveedores, getPrecios, getPedidos } from '@/lib/actions/compras'
import { getForecastEvents, getComprasDias } from '@/lib/actions/finanzas'
import { syncKitsGocelular } from '@/lib/actions/sync-kits'
import GestorClient from './GestorClient'

export default async function GestorPage() {
  await syncKitsGocelular()
  const [productos, proveedores, precios, pedidos, events, dias] = await Promise.all([
    getProductos(),
    getProveedores(),
    getPrecios(),
    getPedidos(),
    getForecastEvents(),
    getComprasDias(),
  ])
  return (
    <GestorClient
      productos={productos}
      proveedores={proveedores}
      precios={precios}
      pedidosGuardados={pedidos}
      forecastApiUrl="https://gocelular-forecast-production.up.railway.app"
      forecastEvents={events}
      forecastDias={dias}
    />
  )
}
