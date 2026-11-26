export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { getAsnsRecientes } from '@/lib/actions/asn-control'
import IngresosAsnTable from './IngresosAsnTable'

// Control de ingreso fisico de ASNs en Andreani por link de escaneo
// (provisorio): ver docs/superpowers/specs/2026-11-26-control-ingreso-asn-design.md
export default async function IngresosAsnPage() {
  const asns = await getAsnsRecientes(60)

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <div className="mb-1">
        <Link href="/compras" className="text-gray-400 hover:text-gray-600 text-sm">&larr; Compras</Link>
      </div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Control de ingreso de ASN</h1>
      <p className="text-sm text-gray-500 mb-6">
        Generá un link por ASN para que el depósito de Andreani escanee los IMEIs al recibirla; las diferencias se avisan a GOcelular por Novedad (manual). Últimos 60 días.
      </p>
      <IngresosAsnTable asns={asns} />
    </div>
  )
}
