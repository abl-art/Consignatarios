export const dynamic = 'force-dynamic'

import { fetchTacsCargados, detectarTacsPendientes } from '@/lib/actions/tacs'
import GestionTacsClient from './GestionTacsClient'

export default async function GestionTacsPage() {
  const [todos, pendientes] = await Promise.all([
    fetchTacsCargados(),
    detectarTacsPendientes(),
  ])
  const cargados = todos.filter(t => t.estado === 'cargado')
  const solicitados = todos.filter(t => t.estado === 'solicitado')
  return <GestionTacsClient cargados={cargados} solicitados={solicitados} pendientesInv={pendientes} />
}
