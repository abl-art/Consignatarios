export const dynamic = 'force-dynamic'

import { getProductos, getProveedores, getPrecios } from '@/lib/actions/compras'
import { syncKitsGocelular } from '@/lib/actions/sync-kits'
import ModelosClient from './ModelosClient'

export default async function ModelosPage() {
  await syncKitsGocelular()
  const [productos, proveedores, precios] = await Promise.all([
    getProductos(),
    getProveedores(),
    getPrecios(),
  ])
  return <ModelosClient productos={productos} proveedores={proveedores} precios={precios} />
}
