'use client'

import { useState, useTransition, useEffect } from 'react'
import { formatearMoneda } from '@/lib/utils'
import { fetchReporteContabilidad, fetchPedidosEnTransito, guardarTransitoSeleccion, type ReporteContabilidad, type PedidoTransito } from '@/lib/actions/pase-contabilidad'

interface Props {
  periodos: string[]
  reporteInicial: ReporteContabilidad | null
}

function formatPeriodo(p: string): string {
  const [year, month] = p.split('-')
  const names = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
  return `${names[parseInt(month, 10) - 1]} ${year}`
}

export default function PaseContabilidadClient({ periodos, reporteInicial }: Props) {
  const [periodo, setPeriodo] = useState(periodos[0] ?? '')
  const [reporte, setReporte] = useState<ReporteContabilidad | null>(reporteInicial)
  const [pending, startTransition] = useTransition()

  const [pedidosTransito, setPedidosTransito] = useState<PedidoTransito[]>([])
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set())
  const [guardandoTransito, setGuardandoTransito] = useState(false)
  const [transitoAbierto, setTransitoAbierto] = useState(false)

  useEffect(() => {
    if (periodo) {
      fetchPedidosEnTransito(periodo).then(t => {
        setPedidosTransito(t)
        setSeleccion(new Set(t.filter(pt => pt.seleccionado).map(pt => pt.id)))
      })
    }
  }, [periodo])

  function handleChangePeriodo(p: string) {
    setPeriodo(p)
    setTransitoAbierto(false)
    startTransition(async () => {
      const r = await fetchReporteContabilidad(p)
      setReporte(r)
    })
  }

  function toggleSeleccion(id: string) {
    setSeleccion(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleGuardarTransito() {
    setGuardandoTransito(true)
    const seleccionados = pedidosTransito
      .filter(p => seleccion.has(p.id))
      .map(p => ({
        id: p.id,
        categoria: p.categoria,
        proveedor: p.proveedorNombre,
        items: p.items,
        unidades: p.unidades,
        valuacion: p.valuacion,
      }))
    await guardarTransitoSeleccion(periodo, seleccionados)
    const r = await fetchReporteContabilidad(periodo)
    setReporte(r)
    // Actualizar estado de seleccion en pedidos
    setPedidosTransito(prev => prev.map(p => ({ ...p, seleccionado: seleccion.has(p.id) })))
    setGuardandoTransito(false)
  }

  return (
    <>
      {/* Selector de período */}
      <div className="flex items-center gap-4 mb-6">
        <label className="text-sm font-medium text-gray-700">Período:</label>
        <select
          value={periodo}
          onChange={e => handleChangePeriodo(e.target.value)}
          disabled={pending}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
        >
          {periodos.map(p => (
            <option key={p} value={p}>{formatPeriodo(p)}</option>
          ))}
        </select>
        {pending && <span className="text-xs text-gray-400">Cargando...</span>}
      </div>

      {periodos.length === 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center text-gray-400 text-sm">
          No hay períodos con datos de cierre disponibles.
        </div>
      )}

      {reporte && (
        <>
          {/* Advertencia si incompleto */}
          {!reporte.completo && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 text-sm text-amber-800">
              <strong>Reporte incompleto:</strong> faltan datos de alguna categoria. Revisa las notas en la tabla.
            </div>
          )}

          {/* Tabla resumen */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto mb-6">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-6 py-3 font-medium text-gray-600">Categoria</th>
                  <th className="text-right px-6 py-3 font-medium text-gray-600">Existencia Final (uds)</th>
                  <th className="text-right px-6 py-3 font-medium text-gray-600">Valuacion</th>
                  <th className="text-left px-6 py-3 font-medium text-gray-600">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {reporte.lineas.map(l => (
                  <tr key={l.categoria} className={
                    l.categoria.includes('En transito')
                      ? 'bg-blue-50/50 hover:bg-blue-50'
                      : l.estado !== 'ok' ? 'bg-amber-50/50' : 'hover:bg-gray-50'
                  }>
                    <td className="px-6 py-3 font-medium text-gray-900">
                      {l.categoria.includes('En transito') && (
                        <span className="inline-block w-2 h-2 rounded-full bg-blue-400 mr-2" />
                      )}
                      {l.categoria}
                    </td>
                    <td className="px-6 py-3 text-right text-blue-600 font-bold">
                      {l.stockFinal !== null ? l.stockFinal : '—'}
                    </td>
                    <td className="px-6 py-3 text-right text-gray-900 font-semibold">
                      {l.valuacion !== null ? formatearMoneda(l.valuacion) : '—'}
                    </td>
                    <td className="px-6 py-3">
                      {l.estado === 'ok' ? (
                        <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                          Completo
                        </span>
                      ) : (
                        <span className="text-xs text-amber-700">{l.nota}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 border-t-2 border-gray-300">
                <tr className="font-bold">
                  <td className="px-6 py-3 text-gray-900">TOTAL</td>
                  <td className="px-6 py-3 text-right text-blue-600">{reporte.totalStock}</td>
                  <td className="px-6 py-3 text-right text-gray-900">{formatearMoneda(reporte.totalValuacion)}</td>
                  <td className="px-6 py-3"></td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Botón PDF */}
          <a
            href={`/api/pdf/pase-contabilidad?periodo=${reporte.periodo}`}
            target="_blank"
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              reporte.completo
                ? 'bg-[#E91E7B] text-white hover:bg-[#d11a6e]'
                : 'bg-gray-200 text-gray-500 hover:bg-gray-300'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Descargar PDF
          </a>
          {!reporte.completo && (
            <p className="text-xs text-gray-400 mt-2">El PDF incluira solo las categorias con datos completos.</p>
          )}

          {/* Pedidos en transito y recibidos sin ingreso */}
          {pedidosTransito.length > 0 && (() => {
            const enTransito = pedidosTransito.filter(p => p.tipo === 'en_transito')
            const recibidosSinIngreso = pedidosTransito.filter(p => p.tipo === 'recibido_sin_ingreso')
            return (
            <div className="mt-6">
              <button
                onClick={() => setTransitoAbierto(!transitoAbierto)}
                className="flex items-center gap-2 text-sm font-semibold text-gray-700 hover:text-gray-900 mb-3"
              >
                <svg className={`w-4 h-4 transition-transform ${transitoAbierto ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                Pedidos en transito y recibidos ({pedidosTransito.length})
              </button>

              {transitoAbierto && (
                <div className="space-y-3">
                  {enTransito.length > 0 && (
                    <>
                      <p className="text-xs text-gray-500 mb-2">
                        <span className="font-semibold text-blue-700">En tránsito</span> — Facturados en {formatPeriodo(periodo)}, no entregados al cierre del mes.
                      </p>
                      {enTransito.map(p => (
                    <div
                      key={p.id}
                      onClick={() => toggleSeleccion(p.id)}
                      className={`border rounded-xl p-4 cursor-pointer transition-colors ${
                        seleccion.has(p.id)
                          ? 'border-blue-400 bg-blue-50'
                          : 'border-gray-200 bg-white hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={seleccion.has(p.id)}
                            onChange={() => toggleSeleccion(p.id)}
                            className="w-4 h-4 rounded border-gray-300 text-blue-600"
                          />
                          <div>
                            <span className="font-semibold text-gray-900 text-sm">{p.proveedorNombre}</span>
                            <span className="text-xs text-gray-500 ml-2">{p.categoria}</span>
                          </div>
                        </div>
                        <span className="text-xs text-gray-400">{new Date(p.fecha).toLocaleDateString('es-AR')}</span>
                      </div>
                      <div className="ml-7 space-y-1">
                        {p.items.map((item, i) => (
                          <div key={i} className="flex justify-between text-xs text-gray-600">
                            <span>{item.productoNombre} x{item.cantidad}</span>
                            <span>{formatearMoneda(item.subtotal)}</span>
                          </div>
                        ))}
                        <div className="flex justify-between text-xs font-semibold text-gray-900 pt-1 border-t border-gray-100">
                          <span>{p.unidades} unidades</span>
                          <span>{formatearMoneda(p.valuacion)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                    </>
                  )}

                  {recibidosSinIngreso.length > 0 && (
                    <>
                      <p className="text-xs text-gray-500 mb-2 mt-4">
                        <span className="font-semibold text-amber-700">Recibidos sin ingreso al stock</span> — Entregados antes del cierre de {formatPeriodo(periodo)}, pendientes de ingreso al stock.
                      </p>
                      {recibidosSinIngreso.map(p => (
                    <div
                      key={p.id}
                      onClick={() => toggleSeleccion(p.id)}
                      className={`border rounded-xl p-4 cursor-pointer transition-colors ${
                        seleccion.has(p.id)
                          ? 'border-amber-400 bg-amber-50'
                          : 'border-gray-200 bg-white hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={seleccion.has(p.id)}
                            onChange={() => toggleSeleccion(p.id)}
                            className="w-4 h-4 rounded border-gray-300 text-amber-600"
                          />
                          <div>
                            <span className="font-semibold text-gray-900 text-sm">{p.proveedorNombre}</span>
                            <span className="text-xs text-gray-500 ml-2">{p.categoria}</span>
                            <span className="text-xs text-amber-600 ml-2">(recibido)</span>
                          </div>
                        </div>
                        <span className="text-xs text-gray-400">{new Date(p.fecha).toLocaleDateString('es-AR')}</span>
                      </div>
                      <div className="ml-7 space-y-1">
                        {p.items.map((item, i) => (
                          <div key={i} className="flex justify-between text-xs text-gray-600">
                            <span>{item.productoNombre} x{item.cantidad}</span>
                            <span>{formatearMoneda(item.subtotal)}</span>
                          </div>
                        ))}
                        <div className="flex justify-between text-xs font-semibold text-gray-900 pt-1 border-t border-gray-100">
                          <span>{p.unidades} unidades</span>
                          <span>{formatearMoneda(p.valuacion)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                    </>
                  )}

                  <button
                    onClick={handleGuardarTransito}
                    disabled={guardandoTransito}
                    className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    {guardandoTransito ? 'Guardando...' : 'Confirmar seleccion'}
                  </button>
                </div>
              )}
            </div>
            )
          })()}
        </>
      )}
    </>
  )
}
