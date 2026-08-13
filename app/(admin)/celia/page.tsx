import { listarConversaciones } from '@/lib/actions/celia'
import CeliaClient from './CeliaClient'

export const dynamic = 'force-dynamic'

export default async function CeliaPage() {
  const conversaciones = await listarConversaciones()
  return <CeliaClient conversacionesIniciales={conversaciones} />
}
