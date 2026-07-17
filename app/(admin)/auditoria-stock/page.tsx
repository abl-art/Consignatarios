export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { fetchAuditorias } from '@/lib/actions/auditoria-stock'
import AuditoriaStockClient from './AuditoriaStockClient'

export default async function AuditoriaStockPage() {
  const auditorias = await fetchAuditorias()
  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <div className="mb-1">
        <Link href="/inventario" className="text-gray-400 hover:text-gray-600 text-sm">← Inventario</Link>
      </div>
      <AuditoriaStockClient auditorias={auditorias} />
    </div>
  )
}
