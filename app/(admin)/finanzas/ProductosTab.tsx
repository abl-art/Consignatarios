'use client'

import { useRouter } from 'next/navigation'
import { eliminarProducto, type ProductoFinanciero } from '@/lib/actions/productos'
import type { ParamsV2, IndicadoresV2 } from '@/lib/simulador-v2'

interface Props {
  productos: ProductoFinanciero[]
}

const fmt$ = (v: number) => '$' + Math.round(v).toLocaleString('es-AR')
const fmtPct = (v: number) => (v * 100).toFixed(1) + '%'

interface FilaV2 {
  p: ProductoFinanciero
  params: ParamsV2
  ind: IndicadoresV2
}

function rentAnualTexto(ind: IndicadoresV2): string {
  if (ind.sin_capital) return 'Sin capital'
  if (ind.rent_anual_capital !== null) return fmtPct(ind.rent_anual_capital)
  return '—'
}

export default function ProductosTab({ productos }: Props) {
  const router = useRouter()

  const v2: FilaV2[] = productos
    .map(p => ({ p, params: p.parametros as unknown as ParamsV2, ind: p.indicadores as unknown as IndicadoresV2 }))
    .filter((x): x is FilaV2 => x.params?.schema_version === 2)

  const propios = v2.filter(x => x.params.modalidad === 'propia')
  const terceros = v2.filter(x => x.params.modalidad === 'terceros')

  const cargar = (id: string) => router.push(`/finanzas?tab=simulador&producto=${id}`)
  const eliminar = async (id: string) => {
    await eliminarProducto(id)
    router.refresh()
  }

  return (
    <div className="space-y-6">
      {/* Tarjeta Venta Propia */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-200 bg-indigo-50">
          <h3 className="font-semibold text-indigo-900">Venta Propia</h3>
          <p className="text-xs text-indigo-500 mt-1">Productos guardados con múltiplo sobre costo</p>
        </div>
        {propios.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-gray-400 text-sm">Todavía no guardaste productos de venta propia</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600">Nombre</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600">Modelo</th>
                  <th className="text-right px-4 py-2.5 font-medium text-gray-600">Múltiplo</th>
                  <th className="text-right px-4 py-2.5 font-medium text-gray-600">PVP</th>
                  <th className="text-right px-4 py-2.5 font-medium text-gray-600">Cuota</th>
                  <th className="text-right px-4 py-2.5 font-medium text-gray-600">Cuotas</th>
                  <th className="text-right px-4 py-2.5 font-medium text-gray-600">Resultado %OA</th>
                  <th className="text-right px-4 py-2.5 font-medium text-gray-600">Rent. anual</th>
                  <th className="text-center px-4 py-2.5 font-medium text-gray-600">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {propios.map(({ p, params, ind }) => {
                  const pvp = params.costo_sin_iva * params.multiplo
                  const cumple = ind.resultado_pct_oa >= params.objetivo_pct_oa / 100
                  return (
                    <tr key={p.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-2.5 font-medium text-gray-900">{p.nombre}</td>
                      <td className="px-4 py-2.5 text-gray-600">{params.modelo_nombre ?? 'genérico'}</td>
                      <td className="px-4 py-2.5 text-right text-gray-600">{params.multiplo.toFixed(2)}</td>
                      <td className="px-4 py-2.5 text-right text-gray-600">{fmt$(pvp)}</td>
                      <td className="px-4 py-2.5 text-right text-gray-600">{fmt$(pvp / params.cuotas)}</td>
                      <td className="px-4 py-2.5 text-right text-gray-600">{params.cuotas}</td>
                      <td className={`px-4 py-2.5 text-right font-semibold ${cumple ? 'text-green-600' : 'text-red-600'}`}>
                        {fmtPct(ind.resultado_pct_oa)}
                      </td>
                      <td className="px-4 py-2.5 text-right text-gray-600">{rentAnualTexto(ind)}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => cargar(p.id)}
                            className="px-2.5 py-1 bg-gray-900 text-white rounded hover:bg-gray-700 transition-colors"
                          >
                            Cargar
                          </button>
                          <button
                            onClick={() => eliminar(p.id)}
                            className="px-2.5 py-1 bg-red-50 text-red-600 rounded hover:bg-red-100 transition-colors"
                          >
                            Eliminar
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Tarjeta Venta de Terceros */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-200 bg-emerald-50">
          <h3 className="font-semibold text-emerald-900">Venta de Terceros</h3>
          <p className="text-xs text-emerald-500 mt-1">Tasa de descuento al comercio por cuotas x estructura de liquidación</p>
        </div>
        {terceros.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-gray-400 text-sm">Todavía no guardaste productos de venta de terceros</p>
          </div>
        ) : (
          <>
            {(() => {
              const conSplitsKey = terceros.map(x => ({
                ...x,
                splitsKey: x.params.splits.map(s => `${s.porcentaje}% a ${s.plazo_dias}d`).join(' / '),
              }))
              const cuotasUnicas = [...new Set(conSplitsKey.map(x => x.params.cuotas))].sort((a, b) => a - b)
              const splitsUnicos = [...new Set(conSplitsKey.map(x => x.splitsKey))]
              const lookup = new Map<string, number>()
              for (const x of conSplitsKey) {
                lookup.set(`${x.params.cuotas}-${x.splitsKey}`, x.params.tasa_descuento_pct)
              }
              return (
                <div className="overflow-x-auto border-b border-gray-200">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50">
                        <th className="text-left px-4 py-2.5 font-medium text-gray-600">Cuotas</th>
                        {splitsUnicos.map(liq => (
                          <th key={liq} className="text-center px-4 py-2.5 font-medium text-gray-600 min-w-[140px]">{liq}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {cuotasUnicas.map(cuotas => (
                        <tr key={cuotas} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="px-4 py-2.5 font-medium text-gray-900">{cuotas} cuotas</td>
                          {splitsUnicos.map(liq => {
                            const tasa = lookup.get(`${cuotas}-${liq}`)
                            return (
                              <td key={liq} className="px-4 py-2.5 text-center">
                                {tasa !== undefined ? (
                                  <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 font-bold rounded-lg">{tasa}%</span>
                                ) : (
                                  <span className="text-gray-300">—</span>
                                )}
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            })()}
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="text-left px-4 py-2.5 font-medium text-gray-600">Nombre</th>
                    <th className="text-right px-4 py-2.5 font-medium text-gray-600">Tasa</th>
                    <th className="text-right px-4 py-2.5 font-medium text-gray-600">Cuotas</th>
                    <th className="text-right px-4 py-2.5 font-medium text-gray-600">Resultado %OA</th>
                    <th className="text-center px-4 py-2.5 font-medium text-gray-600">Cargar</th>
                    <th className="text-center px-4 py-2.5 font-medium text-gray-600">Eliminar</th>
                  </tr>
                </thead>
                <tbody>
                  {terceros.map(({ p, params, ind }) => {
                    const cumple = ind.resultado_pct_oa >= params.objetivo_pct_oa / 100
                    return (
                      <tr key={p.id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="px-4 py-2.5 font-medium text-gray-900">{p.nombre}</td>
                        <td className="px-4 py-2.5 text-right text-gray-600">{params.tasa_descuento_pct}%</td>
                        <td className="px-4 py-2.5 text-right text-gray-600">{params.cuotas}</td>
                        <td className={`px-4 py-2.5 text-right font-semibold ${cumple ? 'text-green-600' : 'text-red-600'}`}>
                          {fmtPct(ind.resultado_pct_oa)}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <button
                            onClick={() => cargar(p.id)}
                            className="px-2.5 py-1 bg-gray-900 text-white rounded hover:bg-gray-700 transition-colors"
                          >
                            Cargar
                          </button>
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <button
                            onClick={() => eliminar(p.id)}
                            className="px-2.5 py-1 bg-red-50 text-red-600 rounded hover:bg-red-100 transition-colors"
                          >
                            Eliminar
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
