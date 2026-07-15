export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { formatearMoneda } from '@/lib/utils'
import type { LiquidacionAfiliado } from '@/lib/types'
import { RowActions, CopiarLinkButton } from './LiquidacionesAfiliadosActions'

const ESTADO_COLORS: Record<string, string> = {
  pendiente: 'bg-blue-100 text-blue-700',
  pagada: 'bg-green-100 text-green-700',
}

export default async function LiquidacionesAfiliadosPage({
  searchParams,
}: {
  searchParams: { mes?: string; afiliado?: string; estado?: string }
}) {
  const supabase = createClient()

  let query = supabase
    .from('liquidaciones_afiliados')
    .select('*')
    .order('created_at', { ascending: false })

  if (searchParams.mes) query = query.eq('mes', searchParams.mes)
  if (searchParams.afiliado) query = query.eq('partner_slug', searchParams.afiliado)
  if (searchParams.estado) query = query.eq('estado', searchParams.estado)

  const { data: liquidaciones } = await query.returns<LiquidacionAfiliado[]>()
  const liqs = liquidaciones ?? []

  // Get unique partner slugs for filter dropdown
  const { data: allLiqs } = await supabase
    .from('liquidaciones_afiliados')
    .select('partner_slug, partner_name')
  const afiliados = Array.from(
    new Map((allLiqs ?? []).map((l) => [l.partner_slug, l.partner_name])).entries()
  ).sort((a, b) => a[1].localeCompare(b[1]))

  const totalPendiente = liqs
    .filter((l) => l.estado === 'pendiente')
    .reduce((s, l) => s + l.monto_a_pagar, 0)

  // Build last 12 months for filter
  const meses: string[] = []
  const now = new Date()
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    meses.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <Link
          href="/canales/afiliados"
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Afiliados
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Liquidaciones de Afiliados</h1>
      </div>
      <p className="text-sm text-gray-500 mb-8">Comisiones mensuales por afiliado</p>

      {/* Summary card */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-sm text-gray-500 mb-1">Por pagar (pendientes)</p>
          <p className="text-2xl font-bold text-blue-700">{formatearMoneda(totalPendiente)}</p>
        </div>
      </div>

      {/* Filter form */}
      <form
        method="GET"
        className="bg-white border border-gray-200 rounded-xl p-4 mb-6 flex flex-wrap gap-3 items-end"
      >
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-600">Mes</label>
          <select
            name="mes"
            defaultValue={searchParams.mes ?? ''}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            <option value="">Todos los periodos</option>
            {meses.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-600">Afiliado</label>
          <select
            name="afiliado"
            defaultValue={searchParams.afiliado ?? ''}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm min-w-[180px]"
          >
            <option value="">Todos</option>
            {afiliados.map(([slug, name]) => (
              <option key={slug} value={slug}>{name}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-600">Estado</label>
          <select
            name="estado"
            defaultValue={searchParams.estado ?? ''}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            <option value="">Todos</option>
            <option value="pendiente">Pendiente</option>
            <option value="pagada">Pagada</option>
          </select>
        </div>

        <button
          type="submit"
          className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 transition-colors"
        >
          Filtrar
        </button>
      </form>

      {/* Table */}
      {liqs.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
          <p className="text-gray-400 text-sm">Sin liquidaciones para este filtro.</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Mes</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Afiliado</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Comisiones</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">A pagar</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Estado</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Factura</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {liqs.map((liq) => (
                <tr key={liq.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 text-gray-700">{liq.mes}</td>
                  <td className="px-4 py-3 text-gray-700">{liq.partner_name}</td>
                  <td className="px-4 py-3 text-right text-gray-700">{formatearMoneda(liq.total_comisiones)}</td>
                  <td className="px-4 py-3 text-right font-bold text-gray-900">{formatearMoneda(liq.monto_a_pagar)}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium capitalize ${ESTADO_COLORS[liq.estado] ?? 'bg-gray-100 text-gray-600'}`}>
                      {liq.estado}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {liq.factura_url ? (
                      <a href={liq.factura_url} target="_blank" rel="noopener noreferrer"
                        className="text-green-600 hover:text-green-800" title="Descargar factura">
                        <svg className="w-5 h-5 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </a>
                    ) : (
                      <span className="text-red-400" title="Sin factura">
                        <svg className="w-5 h-5 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 justify-end">
                      <a href={`/api/pdf/liquidacion-afiliado/${liq.id}`} target="_blank" rel="noopener noreferrer"
                        className="text-xs font-medium text-magenta-600 hover:text-magenta-800">PDF</a>
                      <RowActions id={liq.id} estado={liq.estado} tieneFactura={!!liq.factura_url} />
                      <CopiarLinkButton slug={liq.partner_slug} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
