export const dynamic = 'force-dynamic'

import { getProveedores } from '@/lib/actions/compras'
import { getCategoriasGomarket } from '@/lib/actions/sync-gomarket'
import ProveedoresClient from './ProveedoresClient'

export default async function ProveedoresPage() {
  const [proveedores, gomarketCategorias] = await Promise.all([getProveedores(), getCategoriasGomarket()])
  return <ProveedoresClient proveedores={proveedores} gomarketCategorias={gomarketCategorias} />
}
