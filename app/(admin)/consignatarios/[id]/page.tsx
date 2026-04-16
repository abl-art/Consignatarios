import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { formatearMoneda } from '@/lib/utils'
import type { Consignatario, Asignacion, Diferencia, DispositivoConModelo } from '@/lib/types'
import EditarForm from './EditarForm'

export default async function ConsignatarioDetallePage({ params }: { params: { id: string } }) {
  const supabase = createClient()

  const { data: consignatario } = await supabase
    .from('consignatarios')
    .select('*')
    .eq('id', params.id)
    .single<Consignatario>()

  if (!consignatario) notFound()

  const [{ data: dispositivos }, { data: asignaciones }, { data: auditorias }] = await Promise.all([
    supabase.from('dispositivos').select('*, modelos(id, marca, modelo, precio_costo, created_at)').eq('consignatario_id', params.id)
      .eq('estado', 'asignado').returns<DispositivoConModelo[]>(),
    supabase.from('asignaciones').select('*').eq('consignatario_id', params.id)
      .order('created_at', { ascending: false }).returns<Asignacion[]>(),
    supabase.from('auditorias').select('id').eq('consignatario_id', params.id),
  ])

  const auditoriaIds = auditorias?.map((a) => a.id) ?? []
  const { data: diferencias } = auditoriaIds.length > 0
    ? await supabase.from('diferencias').select('*').eq('estado', 'pendiente')
        .in('auditoria_id', auditoriaIds).returns<Diferencia[]>()
    : { data: [] as Diferencia[] }

  const totalDeuda = (diferencias ?? []).reduce((sum, d) => sum + d.monto_deuda, 0)
  const valorStock = (dispositivos ?? []).reduce((sum, d) => sum + (d.modelos?.precio_costo ?? 0), 0)
  const compromiso = valorStock + totalDeuda

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{consignatario.nombre}</h1>
          <p className="text-sm text-gray-500">{consignatario.email} · {consignatario.telefono}</p>
        </div>
        <div className="flex items-center gap-3">
          {totalDeuda > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-3 text-right">
              <p className="text-xs text-red-600 font-medium uppercase tracking-wide">Deuda pendiente</p>
              <p className="text-xl font-bold text-red-700">{formatearMoneda(totalDeuda)}</p>
            </div>
          )}
          <EditarForm consignatario={consignatario} />
        </div>
      </div>

      {/* Garantía */}
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <h2 className="font-semibold text-gray-900 mb-3">Garantía</h2>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <p className="text-xs text-gray-500">Garantía total</p>
            <p className="text-xl font-bold text-gray-900">{formatearMoneda(consignatario.garantia)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Comprometido</p>
            <p className="text-xl font-bold text-amber-700">{formatearMoneda(compromiso)}</p>
            <p className="text-xs text-gray-400 mt-1">Stock: {formatearMoneda(valorStock)} + Deuda: {formatearMoneda(totalDeuda)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Disponible</p>
            <p className={`text-xl font-bold ${consignatario.garantia - compromiso < 0 ? 'text-red-700' : 'text-green-700'}`}>
              {formatearMoneda(Math.max(0, consignatario.garantia - compromiso))}
            </p>
          </div>
        </div>
      </div>

      {/* Stock asignado */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Stock asignado ({dispositivos?.length ?? 0} equipos)</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-6 py-3 font-medium text-gray-600">IMEI</th>
              <th className="text-left px-6 py-3 font-medium text-gray-600">Modelo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {dispositivos?.map((d) => (
              <tr key={d.id}>
                <td className="px-6 py-3 font-mono text-xs text-gray-700">{d.imei}</td>
                <td className="px-6 py-3 text-gray-900">{d.modelos.marca} {d.modelos.modelo}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Historial de asignaciones */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Historial de asignaciones</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-6 py-3 font-medium text-gray-600">Fecha</th>
              <th className="text-right px-6 py-3 font-medium text-gray-600">Unidades</th>
              <th className="text-right px-6 py-3 font-medium text-gray-600">Valor venta</th>
              <th className="text-left px-6 py-3 font-medium text-gray-600">Firmado por</th>
              <th className="px-6 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {asignaciones?.map((a) => (
              <tr key={a.id}>
                <td className="px-6 py-3 text-gray-700">{new Date(a.fecha).toLocaleDateString('es-AR')}</td>
                <td className="px-6 py-3 text-right text-gray-900">{a.total_unidades}</td>
                <td className="px-6 py-3 text-right font-medium text-gray-900">{formatearMoneda(a.total_valor_venta)}</td>
                <td className="px-6 py-3 text-gray-700">{a.firmado_por}</td>
                <td className="px-6 py-3 text-right">
                  <a href={`/api/pdf/remito/${a.id}`} target="_blank" rel="noopener noreferrer"
                    className="text-magenta-600 text-xs hover:underline">PDF</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
