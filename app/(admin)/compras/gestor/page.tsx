import { getProductos, getProveedores, getPrecios, getPedidos } from '@/lib/actions/compras'
import GestorClient from './GestorClient'

export default async function GestorPage() {
  const [productos, proveedores, precios, pedidos] = await Promise.all([
    getProductos(),
    getProveedores(),
    getPrecios(),
    getPedidos(),
  ])
  return <GestorClient productos={productos} proveedores={proveedores} precios={precios} pedidosGuardados={pedidos} />
}
