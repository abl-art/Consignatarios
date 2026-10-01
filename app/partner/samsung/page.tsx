export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { getDatosPartnerSamsungTodos } from '@/lib/actions/partner-samsung'
import SamsungClient from './SamsungClient'

const TOKEN = 'samsung2026go'

// Vista para el partner Samsung (acuerdo desde el 1/10/2026): proyección de
// unidades Samsung en la tienda propia bajo dos escenarios de share, ranking
// de modelos y plan por modelo. Solo lectura, acceso por token (patrón
// /catalogo y /proveedor/kits). Solo se muestran datos de la marca.
export default async function PartnerSamsungPage({
  searchParams,
}: {
  searchParams: { token?: string }
}) {
  if (searchParams.token !== TOKEN) notFound()

  const datos = await getDatosPartnerSamsungTodos()
  if (!datos.propia && !datos.total) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center text-sm text-gray-500">
        Datos no disponibles en este momento — reintentá en unos minutos.
      </div>
    )
  }

  return <SamsungClient datos={datos} />
}
