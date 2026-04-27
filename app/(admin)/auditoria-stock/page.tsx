export const dynamic = 'force-dynamic'

import { fetchAuditorias } from '@/lib/actions/auditoria-stock'
import AuditoriaStockClient from './AuditoriaStockClient'

export default async function AuditoriaStockPage() {
  const auditorias = await fetchAuditorias()
  return <AuditoriaStockClient auditorias={auditorias} />
}
