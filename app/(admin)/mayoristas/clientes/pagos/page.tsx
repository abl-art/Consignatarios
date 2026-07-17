export const dynamic = 'force-dynamic'

import { getClientesMayoristas } from '@/lib/actions/clientes-mayoristas'
import { getExposicionRiesgo } from '@/lib/actions/pagos-mayoristas'
import Link from 'next/link'
import PagosClient from './PagosClient'

export default async function PagosPage() {
  const [clientes, exposicion] = await Promise.all([
    getClientesMayoristas(),
    getExposicionRiesgo(),
  ])

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <div className="flex items-center gap-2 mb-8">
        <Link href="/mayoristas/clientes" className="text-gray-400 hover:text-gray-600">← Clientes</Link>
        <h1 className="text-2xl font-bold text-gray-900">Pagos</h1>
      </div>
      <PagosClient clientes={clientes} exposicion={exposicion} />
    </div>
  )
}
