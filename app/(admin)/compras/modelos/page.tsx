import { getProductos, getProveedores, getPrecios } from '@/lib/actions/compras'
import ModelosClient from './ModelosClient'

export default async function ModelosPage() {
  const [productos, proveedores, precios] = await Promise.all([
    getProductos(),
    getProveedores(),
    getPrecios(),
  ])
  return <ModelosClient productos={productos} proveedores={proveedores} precios={precios} />
}
