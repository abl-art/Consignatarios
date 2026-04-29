export const dynamic = 'force-dynamic'

import { fetchTacsCargados, detectarTacsPendientes } from '@/lib/actions/tacs'
import GestionTacsClient from './GestionTacsClient'

export default async function GestionTacsPage() {
  const [cargados, pendientes] = await Promise.all([
    fetchTacsCargados(),
    detectarTacsPendientes(),
  ])
  return <GestionTacsClient cargados={cargados} pendientesInv={pendientes} />
}
