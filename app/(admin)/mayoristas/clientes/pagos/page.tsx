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
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <div className="flex items-center gap-2 mb-1">
        <Link href="/mayoristas/clientes" className="text-gray-400 hover:text-gray-600 text-sm">← Clientes</Link>
      </div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Pagos Mayoristas</h1>
      <p className="text-sm text-gray-500 mb-6">Asentar pagos y control de exposición al riesgo</p>
      <PagosClient clientes={clientes} exposicion={exposicion} />
    </div>
  )
}
