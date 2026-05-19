export const dynamic = 'force-dynamic'

import { getProveedores } from '@/lib/actions/compras'
import ProveedoresClient from './ProveedoresClient'

export default async function ProveedoresPage() {
  const proveedores = await getProveedores()
  return <ProveedoresClient proveedores={proveedores} />
}
