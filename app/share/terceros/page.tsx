export const dynamic = 'force-dynamic'

import { createAdminClient } from '@/lib/supabase/admin'
import { formatearMoneda } from '@/lib/utils'
import { fetchVentasTerceros, CLIENT_IDS_PROPIOS } from '@/lib/gocelular'
import { createClient } from '@/lib/supabase/server'
import ShareTercerosChart from './ShareTercerosChart'

interface TokenEntry {
  token: string
  merchant: string
  label: string
}

async function validateToken(token: string): Promise<TokenEntry | null> {
  const sb = createAdminClient()
  const { data } = await sb.from('flujo_config').select('value').eq('key', 'share_terceros_tokens').single()
  if (!data?.value) return null
  const tokens: TokenEntry[] = JSON.parse(data.value)
  return tokens.find(t => t.token === token) || null
}

const MERCHANT_ALIASES: Record<string, string> = { RIIING: 'RIING', RIIIING: 'RIING', DIGGIT: 'RIING' }
function getMerchantName(storeName: string): string {
  const raw = storeName.split(/[\s-]/)[0].trim().toUpperCase()
  return MERCHANT_ALIASES[raw] || raw
}

export default async function ShareTercerosPage({
  searchParams,
}: {
  searchParams: { token?: string; desde?: string; hasta?: string }
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

  const supabase = createClient()
  const [ventas, { data: consigs }] = await Promise.all([
    fetchVentasTerceros(),
    supabase.from('consignatarios').select('store_prefix'),
  ])

  const prefixes = (consigs ?? [])
    .filter((c: { store_prefix: string | null }) => c.store_prefix)
    .map((c: { store_prefix: string | null }) => c.store_prefix!.toLowerCase())

  // Filtrar terceros y luego solo el merchant permitido
  const terceros = ventas.filter(v => {
    if (CLIENT_IDS_PROPIOS.includes(v.client_id)) return false
    const lower = v.store_name.toLowerCase()
    if (lower.startsWith('ecommerce')) return false
    if (prefixes.some(p => lower.startsWith(p))) return false
    return getMerchantName(v.store_name) === merchantPermitido
  })

  const desdeSeleccionado = searchParams.desde || ''
  const hastaSeleccionado = searchParams.hasta || ''

  let filtrados = terceros
  if (desdeSeleccionado) filtrados = filtrados.filter(t => t.fecha >= desdeSeleccionado)
  if (hastaSeleccionado) filtrados = filtrados.filter(t => t.fecha <= hastaSeleccionado)

  // Agrupar por tienda
  const porTienda: Record<string, { store_name: string; ventas: number; monto: number }> = {}
  for (const t of filtrados) {
    const key = t.store_name.replace(/\s+/g, ' ').trim()
    if (!porTienda[key]) porTienda[key] = { store_name: key, ventas: 0, monto: 0 }
    porTienda[key].ventas += t.ventas
    porTienda[key].monto += t.monto
  }

  const tiendas = Object.values(porTienda).sort((a, b) => b.ventas - a.ventas)
  const totalVentas = filtrados.reduce((s, t) => s + t.ventas, 0)
  const totalMonto = filtrados.reduce((s, t) => s + t.monto, 0)

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="p-6 md:p-8 max-w-6xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Ventas {merchantPermitido}</h1>
          <p className="text-sm text-gray-500">Panel de ventas — solo lectura</p>
        </div>

        {/* Gráficos */}
        <ShareTercerosChart data={terceros.map(t => ({ store_name: t.store_name, fecha: t.fecha, ventas: t.ventas, monto: t.monto }))} />

        {/* Filtros */}
        <form method="GET" className="flex flex-wrap gap-3 items-end mb-6">
          <input type="hidden" name="token" value={token} />
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Desde</label>
            <input type="date" name="desde" defaultValue={desdeSeleccionado} className="px-3 py-2 border border-gray-300 rounded-lg text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Hasta</label>
            <input type="date" name="hasta" defaultValue={hastaSeleccionado} className="px-3 py-2 border border-gray-300 rounded-lg text-sm" />
          </div>
          <button type="submit" className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 transition-colors">
            Filtrar
          </button>
          {(desdeSeleccionado || hastaSeleccionado) && (
            <a href={`/share/terceros?token=${token}`} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">Limpiar</a>
          )}
        </form>

        <p className="text-sm text-gray-500 mb-6">
          {totalVentas} ventas · {formatearMoneda(totalMonto)}
          {desdeSeleccionado ? ` · desde ${desdeSeleccionado}` : ''}
          {hastaSeleccionado ? ` · hasta ${hastaSeleccionado}` : ''}
        </p>

        {/* Detalle por tienda */}
        {tiendas.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl p-12 text-center text-gray-400 text-sm">
            Sin ventas para este periodo.
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/60 flex items-center justify-between">
              <h2 className="font-bold text-gray-900">{merchantPermitido}</h2>
              <div className="flex items-center gap-4">
                <span className="text-sm text-gray-500">{totalVentas} ventas</span>
                <span className="text-sm font-semibold text-green-700">{formatearMoneda(totalMonto)}</span>
              </div>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-white">
                <tr className="border-b border-gray-100">
                  <th className="text-left px-6 py-2 font-medium text-gray-600">Tienda</th>
                  <th className="text-right px-6 py-2 font-medium text-gray-600">Ventas</th>
                  <th className="text-right px-6 py-2 font-medium text-gray-600">Monto</th>
                  <th className="text-right px-6 py-2 font-medium text-gray-600">Ticket prom.</th>
                  <th className="text-right px-6 py-2 font-medium text-gray-600">%</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {tiendas.map(t => (
                  <tr key={t.store_name} className="hover:bg-gray-50">
                    <td className="px-6 py-2 text-gray-900">{t.store_name}</td>
                    <td className="px-6 py-2 text-right font-bold text-gray-900">{t.ventas}</td>
                    <td className="px-6 py-2 text-right text-green-700 font-medium">{formatearMoneda(t.monto)}</td>
                    <td className="px-6 py-2 text-right text-gray-600">{t.ventas > 0 ? formatearMoneda(Math.round(t.monto / t.ventas)) : '—'}</td>
                    <td className="px-6 py-2 text-right text-gray-500">{((t.ventas / Math.max(totalVentas, 1)) * 100).toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-center text-xs text-gray-300 mt-8">GOcelular360</p>
      </div>
    </div>
  )
}
