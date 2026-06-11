export const dynamic = 'force-dynamic'

import { createAdminClient } from '@/lib/supabase/admin'
import { fetchAlertasSinImei, fetchOrdenesConImei } from '@/lib/gocelular'
import SinImeiClient from './SinImeiClient'

interface TokenEntry {
  token: string
  merchant: string
  label: string
}

const MERCHANT_ALIASES: Record<string, string> = { RIIING: 'RIING', RIIIING: 'RIING', DIGGIT: 'RIING' }
function getMerchantFromStore(storeName: string): string {
  const raw = storeName.split(/[\s-]/)[0].trim().toUpperCase()
  return MERCHANT_ALIASES[raw] || raw
}

async function validateToken(token: string): Promise<TokenEntry | null> {
  const sb = createAdminClient()
  const { data } = await sb.from('flujo_config').select('value').eq('key', 'share_sin_imei_tokens').single()
  if (!data?.value) return null
  const tokens: TokenEntry[] = JSON.parse(data.value)
  return tokens.find(t => t.token === token) || null
}

export default async function ShareSinImeiPage({
  searchParams,
}: {
  searchParams: { token?: string }
}) {
  const token = searchParams.token
  if (!token) {
    return <div className="min-h-screen flex items-center justify-center"><p className="text-gray-400">Acceso no autorizado</p></div>
  }

  const tokenEntry = await validateToken(token)
  if (!tokenEntry) {
    return <div className="min-h-screen flex items-center justify-center"><p className="text-gray-400">Token invalido o expirado</p></div>
  }

  const merchantPermitido = tokenEntry.merchant

  const [allSinImei, allOrdenesConImei] = await Promise.all([
    fetchAlertasSinImei().catch(() => []),
    fetchOrdenesConImei().catch(() => []),
  ])

  // Filtrar solo el merchant permitido
  const tiendas = allSinImei.filter(t => getMerchantFromStore(t.storeName) === merchantPermitido)
  const ordenesConImei = allOrdenesConImei.filter(o => getMerchantFromStore(o.storeName) === merchantPermitido)

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="p-4 md:p-8 max-w-6xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Control de ordenes — {merchantPermitido}</h1>
          <p className="text-sm text-gray-500">Datos en tiempo real desde GOcelular.</p>
        </div>

        <SinImeiClient
          tiendas={tiendas}
          ordenesConImei={ordenesConImei}
          merchant={merchantPermitido}
        />

        <p className="text-center text-xs text-gray-300 mt-8">GOcelular360</p>
      </div>
    </div>
  )
}
