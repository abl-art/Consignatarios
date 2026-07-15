export const dynamic = 'force-dynamic'

import { getMupConfig, getProductosCelularesConPrecio } from '@/lib/actions/lista-precios'
import { getProformas } from '@/lib/actions/proformas'
import ProformasClient from './ProformasClient'

export default async function ProformasPage() {
  const [mup, productos, proformas] = await Promise.all([
    getMupConfig(),
    getProductosCelularesConPrecio(),
    getProformas(),
  ])
  return (
    <ProformasClient
      productos={productos.filter(p => !p.oculto_lista_precios)}
      mupInicial={mup}
      proformasGuardadas={proformas}
    />
  )
}
