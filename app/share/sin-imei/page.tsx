export const dynamic = 'force-dynamic'

import { createAdminClient } from '@/lib/supabase/admin'
import { formatearMoneda } from '@/lib/utils'
import { fetchAlertasSinImei } from '@/lib/gocelular'

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

  // Traer todas las alertas sin IMEI y filtrar solo el merchant permitido
  const allData = await fetchAlertasSinImei().catch(() => [])
  const tiendas = allData.filter(t => getMerchantFromStore(t.storeName) === merchantPermitido)

  const totalSinImei = tiendas.reduce((s, t) => s + t.sinImei, 0)
  const totalMonto = tiendas.reduce((s, t) => s + t.ordenes.reduce((s2, o) => s2 + o.monto, 0), 0)

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="p-4 md:p-8 max-w-5xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Ordenes sin IMEI — {merchantPermitido}</h1>
          <p className="text-sm text-gray-500">Ordenes entregadas que aun no tienen equipo asignado. Datos en tiempo real.</p>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500 mb-1">Tiendas afectadas</p>
            <p className="text-2xl font-bold text-gray-900">{tiendas.length}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500 mb-1">Ordenes sin IMEI</p>
            <p className="text-2xl font-bold text-rose-700">{totalSinImei}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500 mb-1">Monto comprometido</p>
            <p className="text-2xl font-bold text-rose-700">{formatearMoneda(totalMonto)}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500 mb-1">Merchant</p>
            <p className="text-2xl font-bold text-gray-900">{merchantPermitido}</p>
          </div>
        </div>

        {tiendas.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <p className="text-green-700 text-sm font-medium">Sin ordenes pendientes de IMEI</p>
          </div>
        ) : (
          <div className="space-y-4">
            {tiendas.map(t => (
              <div key={t.storeName} className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
                <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/60 flex items-center justify-between">
                  <h2 className="font-semibold text-gray-900 text-sm">{t.storeName}</h2>
                  <div className="flex items-center gap-4">
                    <span className="text-xs text-rose-700 font-bold">{t.sinImei} sin IMEI</span>
                    <span className="text-xs text-gray-500">de {t.total} ordenes</span>
                    <span className="text-xs text-rose-700 font-medium">{formatearMoneda(t.ordenes.reduce((s, o) => s + o.monto, 0))}</span>
                  </div>
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-white">
                    <tr className="border-b border-gray-100">
                      <th className="text-left px-5 py-2 font-medium text-gray-600">Order ID</th>
                      <th className="text-left px-4 py-2 font-medium text-gray-600">DNI</th>
                      <th className="text-left px-4 py-2 font-medium text-gray-600">Nombre</th>
                      <th className="text-right px-4 py-2 font-medium text-gray-600">Fecha</th>
                      <th className="text-right px-5 py-2 font-medium text-gray-600">Monto</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {t.ordenes.map(o => (
                      <tr key={o.orderId} className="hover:bg-gray-50">
                        <td className="px-5 py-2 font-mono text-gray-500 text-xs">{o.orderId}</td>
                        <td className="px-4 py-2 font-mono text-gray-700">{o.userDni}</td>
                        <td className="px-4 py-2 text-gray-700">{o.userName}</td>
                        <td className="px-4 py-2 text-right text-gray-500">{o.fecha}</td>
                        <td className="px-5 py-2 text-right font-medium text-gray-900">{formatearMoneda(o.monto)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}

        <p className="text-center text-xs text-gray-300 mt-8">GOcelular360</p>
      </div>
    </div>
  )
}
