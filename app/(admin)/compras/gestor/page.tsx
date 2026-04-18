import { getProductos, getProveedores, getPrecios } from '@/lib/actions/compras'
import GestorClient from './GestorClient'

export default async function GestorPage() {
  const [productos, proveedores, precios] = await Promise.all([
    getProductos(),
    getProveedores(),
    getPrecios(),
  ])
  return <GestorClient productos={productos} proveedores={proveedores} precios={precios} />
}
