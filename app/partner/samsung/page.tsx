export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { getDatosPartnerSamsungTodos, PARTNER_SAMSUNG_TOKEN as TOKEN } from '@/lib/actions/partner-samsung'
import { fetchStockPorWarehouse, fetchPendientesPicking } from '@/lib/gocelular'
import { completarDisponibilidad } from '@/lib/disponibilidad'
import { aplicarPedidos } from '@/lib/pedidos-pendientes'
import { getPedidos } from '@/lib/actions/compras'
import { sincronizarIngresosGocelular } from '@/lib/actions/sync-ingresos'
import { filtrarStockSamsung } from '@/lib/partner-samsung'
import SamsungClient from './SamsungClient'

// Vista para el partner Samsung (acuerdo desde el 1/10/2026): proyección de
// unidades Samsung en la tienda propia bajo dos escenarios de share, tortas
// de share por marca y SKUs vendidos. Solo lectura, acceso por token (patrón
// /catalogo y /proveedor/kits). Solo se muestran datos de la marca.
export default async function PartnerSamsungPage({
  searchParams,
}: {
  searchParams: { token?: string }
}) {
  if (searchParams.token !== TOKEN) notFound()

  // Stock Samsung con la misma lógica que /inventario/stock (Disponible real =
  // depósitos − pendientes de asignar); si el stock falla, el link igual carga.
  // El sync de ingresos corre primero para no mostrar tránsito fantasma de
  // pedidos cuyas unidades ya llegaron (best-effort, no rompe la página).
  await sincronizarIngresosGocelular()
  const [datos, baseRows, pendientes, pedidos] = await Promise.all([
    getDatosPartnerSamsungTodos(),
    fetchStockPorWarehouse().catch(() => []),
    fetchPendientesPicking().catch(() => ({ gocuotas: {}, andreani: {} })),
    getPedidos().catch(() => []),
  ])
  const stockSamsung = filtrarStockSamsung(
    completarDisponibilidad(aplicarPedidos(baseRows, pedidos), pendientes)
  )
  if (!datos.propia && !datos.total) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center text-sm text-gray-500">
        Datos no disponibles en este momento — reintentá en unos minutos.
      </div>
    )
  }

  return <SamsungClient datos={datos} stockSamsung={stockSamsung} />
}
