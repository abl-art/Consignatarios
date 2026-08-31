export const dynamic = 'force-dynamic'

import { createAdminClient } from '@/lib/supabase/admin'
import { fetchStockPorWarehouse, fetchPendientesPicking } from '@/lib/gocelular'
import { completarDisponibilidad } from '@/lib/disponibilidad'
import { aplicarPedidos } from '@/lib/pedidos-pendientes'
import { getPedidos } from '@/lib/actions/compras'
import StockTable from '../../(admin)/inventario/stock/StockTable'

interface TokenEntry {
  token: string
  label: string
}

async function validateToken(token: string): Promise<TokenEntry | null> {
  const sb = createAdminClient()
  const { data } = await sb.from('flujo_config').select('value').eq('key', 'share_stock_tokens').single()
  if (!data?.value) return null
  const tokens: TokenEntry[] = JSON.parse(data.value)
  return tokens.find(t => t.token === token) || null
}

export default async function ShareStockPage({
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

  const [baseRows, pendientes, pedidos] = await Promise.all([
    fetchStockPorWarehouse(),
    fetchPendientesPicking().catch(() => ({ gocuotas: {}, andreani: {} })),
    getPedidos().catch(() => []),
  ])
  const rows = completarDisponibilidad(aplicarPedidos(baseRows, pedidos), pendientes)

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="p-4 md:p-8 max-w-7xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Stock por Deposito</h1>
        <p className="text-sm text-gray-500 mb-6">GOcelular — disponibilidad por SKU y ubicación</p>
        <StockTable rows={rows} />
      </div>
    </div>
  )
}
