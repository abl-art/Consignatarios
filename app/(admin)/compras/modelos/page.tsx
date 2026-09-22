export const dynamic = 'force-dynamic'

import { getProductos, getProveedores, getPrecios } from '@/lib/actions/compras'
import { syncKitsGocelular } from '@/lib/actions/sync-kits'
import { syncProductosGomarket, getCategoriasGomarket, getProductosGomarketSinSku } from '@/lib/actions/sync-gomarket'
import ModelosClient from './ModelosClient'

export default async function ModelosPage() {
  await Promise.all([syncKitsGocelular(), syncProductosGomarket()])
  const [productos, proveedores, precios, gomarketCategorias, gomarketSinSku] = await Promise.all([
    getProductos(),
    getProveedores(),
    getPrecios(),
    getCategoriasGomarket(),
    getProductosGomarketSinSku(),
  ])
  return (
    <ModelosClient
      productos={productos}
      proveedores={proveedores}
      precios={precios}
      gomarketCategorias={gomarketCategorias}
      gomarketSinSku={gomarketSinSku}
    />
  )
}
