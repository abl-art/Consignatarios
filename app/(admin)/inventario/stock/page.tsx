export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { fetchStockPorWarehouse } from '@/lib/gocelular'
import StockTable from './StockTable'
import { DIAS_TRANSITO_TRABADO, diasDesde } from '@/lib/transito'

export default async function StockPage() {
  const rows = await fetchStockPorWarehouse()

  const totalAndreani = rows.reduce((s, r) => s + r.whAndreani, 0)
  const totalGocuotas = rows.reduce((s, r) => s + r.whGocuotas, 0)
  const totalTransito = rows.reduce((s, r) => s + r.enTransito, 0)
  const totalGeneral = rows.reduce((s, r) => s + r.total, 0)

  // Transito trabado: unidades que Andreani nunca recibio y por eso no suman a ningun deposito
  const trabados = rows.filter(r => r.enTransito > 0 && r.enTransitoDesde && diasDesde(r.enTransitoDesde) >= DIAS_TRANSITO_TRABADO)
  const unidadesTrabadas = trabados.reduce((s, r) => s + r.enTransito, 0)

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <div className="mb-1">
        <Link href="/inventario" className="text-gray-400 hover:text-gray-600 text-sm">&larr; Inventario</Link>
      </div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Stock por Deposito</h1>
      <p className="text-sm text-gray-500 mb-6">
        Inventario disponible por SKU y ubicacion — {totalGeneral} unidades en depósitos
        {totalTransito > 0 ? ` + ${totalTransito} en tránsito` : ''}
      </p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-gray-900">{totalAndreani.toLocaleString()}</p>
          <p className="text-xs text-gray-500 mt-1">WH Andreani</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-gray-900">{totalGocuotas.toLocaleString()}</p>
          <p className="text-xs text-gray-500 mt-1">WH GOcuotas</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-amber-600">{totalTransito.toLocaleString()}</p>
          <p className="text-xs text-gray-500 mt-1">En tránsito</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-gray-900">{totalGeneral.toLocaleString()}</p>
          <p className="text-xs text-gray-500 mt-1">Total en depósitos</p>
        </div>
      </div>

      {unidadesTrabadas > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
          <p className="text-sm text-red-700 font-medium">
            {unidadesTrabadas.toLocaleString()} unidades llevan más de {DIAS_TRANSITO_TRABADO} días en tránsito a Andreani
          </p>
          <p className="text-xs text-red-600 mt-1">
            No están en ningún depósito y no suman al total: {trabados.map(r => `${r.nombre} (${r.enTransito})`).join(' · ')}.
            Si ya llegaron, hay que actualizarlas en GOcelular.
          </p>
        </div>
      )}

      <StockTable rows={rows} />
    </div>
  )
}
