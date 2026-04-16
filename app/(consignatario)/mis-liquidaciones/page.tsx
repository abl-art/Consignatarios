import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getCurrentConsignatario } from '@/lib/consignatario-helpers'
import { formatearMoneda } from '@/lib/utils'
import type { Liquidacion } from '@/lib/types'

const ESTADO_COLORS: Record<string, string> = {
  retenida: 'bg-yellow-100 text-yellow-700',
  pendiente: 'bg-blue-100 text-blue-700',
  bloqueada: 'bg-red-100 text-red-700',
  pagada: 'bg-green-100 text-green-700',
}

export default async function MisLiquidacionesPage() {
  const consignatario = await getCurrentConsignatario()
  const supabase = createClient()

  const { data: liquidaciones } = await supabase.from('liquidaciones').select('*')
    .eq('consignatario_id', consignatario.id)
    .order('mes', { ascending: false }).returns<Liquidacion[]>()

  const now = new Date()
  const mesActual = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  const liqs = liquidaciones ?? []
  const retenidaActual = liqs.find((l) => l.mes === mesActual && l.estado === 'retenida')
  const bloqueada = liqs.find((l) => l.estado === 'bloqueada')

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-8">Mis liquidaciones</h1>

      {retenidaActual && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4 text-sm text-amber-800">
          <strong>Pago retenido.</strong> Completá tu auto-auditoría de {retenidaActual.mes} para liberar {formatearMoneda(retenidaActual.monto_a_pagar)}.
          <Link href="/auto-auditoria" className="ml-2 underline font-medium">Hacer auto-auditoría →</Link>
        </div>
      )}

      {bloqueada && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4 text-sm text-red-800">
          <strong>Liquidación de {bloqueada.mes} bloqueada.</strong> Contactá al administrador para destrabar el pago.
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {liqs.length === 0 ? (
          <div className="px-6 py-16 text-center text-gray-500">
            <p className="text-sm">No hay liquidaciones generadas aún.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-6 py-3 font-medium text-gray-600">Mes</th>
                <th className="text-right px-6 py-3 font-medium text-gray-600">Comisiones</th>
                <th className="text-right px-6 py-3 font-medium text-gray-600">Diferencias</th>
                <th className="text-right px-6 py-3 font-medium text-gray-600">A pagar</th>
                <th className="text-left px-6 py-3 font-medium text-gray-600">Estado</th>
                <th className="px-6 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {liqs.map((l) => (
                <tr key={l.id} className="hover:bg-gray-50">
                  <td className="px-6 py-3 font-medium text-gray-900">{l.mes}</td>
                  <td className="px-6 py-3 text-right text-gray-700">{formatearMoneda(l.total_comisiones)}</td>
                  <td className="px-6 py-3 text-right text-red-600">-{formatearMoneda(l.total_diferencias_descontadas)}</td>
                  <td className="px-6 py-3 text-right font-bold text-gray-900">{formatearMoneda(l.monto_a_pagar)}</td>
                  <td className="px-6 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${ESTADO_COLORS[l.estado]}`}>
                      {l.estado}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-right">
                    <a href={`/api/pdf/liquidacion/${l.id}`} target="_blank" rel="noopener noreferrer"
                      className="text-xs font-medium text-magenta-600 hover:text-magenta-800">PDF</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
