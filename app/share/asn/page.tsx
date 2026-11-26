export const dynamic = 'force-dynamic'

import { getControlPorToken } from '@/lib/actions/asn-control'
import ScannerClient from './ScannerClient'

// Link publico por ASN para que el deposito de Andreani controle el ingreso
// fisico escaneando los IMEIs (provisorio hasta que exista API de ingreso).
export default async function ShareAsnPage({ searchParams }: { searchParams: { token?: string } }) {
  const token = searchParams.token
  const control = token ? await getControlPorToken(token) : null

  if (!token || !control) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-400">Acceso no autorizado</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-6 px-4">
      <div className="max-w-2xl mx-auto">
        <ScannerClient token={token} control={control} />
      </div>
    </div>
  )
}
