export const dynamic = 'force-dynamic'

import { getMupConfig, getProductosCelularesConPrecio } from '@/lib/actions/lista-precios'
import ListaPreciosClient from './ListaPreciosClient'

export default async function ListaPreciosPage() {
  const [mup, productos] = await Promise.all([
    getMupConfig(),
    getProductosCelularesConPrecio(),
  ])
  return <ListaPreciosClient productos={productos} mupInicial={mup} />
}
