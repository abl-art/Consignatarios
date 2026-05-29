'use client'

import { useState, useTransition } from 'react'
import { formatearMoneda } from '@/lib/utils'
import { ocultarTenenciaModelo, mostrarTenenciaModelo } from '@/lib/actions/tenencia-ocultos'

interface ModeloRow {
  brand: string
  name: string
  model_code: string
  default_price: number | null
  min_stock_alert: number | null
  disponibles: number
  pendientes: number
  real: number
  precio_unit: number
  valor: number
}

interface UnmatchedRow {
  product_name: string
  pendientes: number
  key: string
}

interface Props {
  rows: ModeloRow[]
  unmatched: UnmatchedRow[]
  modelosOcultos: string[]
}

function EyeIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function EyeOffIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  )
}

function rowClasses(r: ModeloRow): { bg: string; label: string | null } {
  if (r.min_stock_alert !== null && r.real < r.min_stock_alert) {
    return { bg: 'bg-red-50', label: 'REPONER' }
  }
  if (r.real < 0) return { bg: 'bg-amber-50', label: 'SOBREVENTA' }
  return { bg: '', label: null }
}

export default function TenenciaTable({ rows, unmatched, modelosOcultos }: Props) {
  const [mostrarOcultos, setMostrarOcultos] = useState(false)
  const [ocultos, setOcultos] = useState<Set<string>>(new Set(modelosOcultos))
  const [, startTransition] = useTransition()

  function esOculto(modelCode: string) {
    return ocultos.has(modelCode)
  }

  function handleToggle(modelCode: string) {
    const hidden = esOculto(modelCode)
    setOcultos(prev => {
      const next = new Set(prev)
      if (hidden) next.delete(modelCode)
      else next.add(modelCode)
      return next
    })
    startTransition(async () => {
      if (hidden) await mostrarTenenciaModelo(modelCode)
      else await ocultarTenenciaModelo(modelCode)
    })
  }

  const visibleRows = rows.filter(r => !esOculto(r.model_code))
  const hiddenCount = rows.filter(r => esOculto(r.model_code)).length
  const displayRows = mostrarOcultos ? rows : visibleRows

  const totalDisponibles = visibleRows.reduce((s, r) => s + r.disponibles, 0)
  const totalPendientes = visibleRows.reduce((s, r) => s + r.pendientes, 0)
  const totalReal = visibleRows.reduce((s, r) => s + r.real, 0)
  const totalValor = visibleRows.reduce((s, r) => s + r.valor, 0)

  return (
    <>
      {/* Resumen */}
      <div className="bg-magenta-50 border border-magenta-200 rounded-xl p-4 mb-4 flex flex-wrap gap-3 md:gap-6 text-sm">
        <div>
          <p className="text-xs text-gray-500">Modelos activos</p>
          <p className="font-bold text-gray-900">{visibleRows.length}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Disponibles</p>
          <p className="font-bold text-green-700">{totalDisponibles}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Pendientes de asignar</p>
          <p className="font-bold text-amber-700">{totalPendientes}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Disponibilidad real</p>
          <p className={`font-bold ${totalReal < 0 ? 'text-red-700' : 'text-magenta-700'}`}>{totalReal}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Valor stock</p>
          <p className="font-bold text-green-700">{formatearMoneda(totalValor)}</p>
        </div>
      </div>

      {/* Toggle ocultos */}
      {hiddenCount > 0 && (
        <div className="mb-4 flex">
          <button
            onClick={() => setMostrarOcultos(prev => !prev)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 transition-colors"
          >
            {mostrarOcultos ? <EyeOffIcon /> : <EyeIcon />}
            {mostrarOcultos ? `Ocultar ${hiddenCount} ocultos` : `Mostrar ${hiddenCount} ocultos`}
          </button>
        </div>
      )}

      {/* Tabla */}
      {displayRows.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center text-gray-400 text-sm">
          Sin modelos activos en GOcelular.
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="w-10 px-2 py-3" />
                <th className="text-left px-6 py-3 font-medium text-gray-600">Marca</th>
                <th className="text-left px-6 py-3 font-medium text-gray-600">Modelo</th>
                <th className="text-right px-6 py-3 font-medium text-gray-600">Disponibles</th>
                <th className="text-right px-6 py-3 font-medium text-gray-600">Pend. asignar</th>
                <th className="text-right px-6 py-3 font-medium text-gray-600">Disp. real</th>
                <th className="text-right px-6 py-3 font-medium text-gray-600">Precio unit.</th>
                <th className="text-right px-6 py-3 font-medium text-gray-600">Valor</th>
                <th className="text-right px-6 py-3 font-medium text-gray-600">Minimo</th>
                <th className="text-left px-6 py-3 font-medium text-gray-600">Alerta</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {displayRows.map((r) => {
                const hidden = esOculto(r.model_code)
                const cls = rowClasses(r)
                return (
                  <tr
                    key={r.model_code}
                    className={`hover:bg-gray-50 ${hidden ? 'opacity-40' : ''} ${!hidden ? cls.bg : ''}`}
                  >
                    <td className="px-2 py-3 text-center">
                      <button
                        onClick={() => handleToggle(r.model_code)}
                        title={hidden ? 'Mostrar modelo' : 'Ocultar modelo'}
                        className="text-gray-400 hover:text-gray-600 transition-colors"
                      >
                        {hidden ? <EyeOffIcon /> : <EyeIcon />}
                      </button>
                    </td>
                    <td className="px-6 py-3 font-medium text-gray-900">{r.brand}</td>
                    <td className="px-6 py-3 text-gray-700">{r.name}</td>
                    <td className="px-6 py-3 text-right font-semibold text-green-700">{r.disponibles}</td>
                    <td className="px-6 py-3 text-right text-amber-700">{r.pendientes}</td>
                    <td className={`px-6 py-3 text-right font-bold ${r.real < 0 ? 'text-red-700' : 'text-gray-900'}`}>
                      {r.real}
                    </td>
                    <td className="px-6 py-3 text-right text-gray-600">
                      {r.precio_unit > 0 ? formatearMoneda(r.precio_unit) : '-'}
                    </td>
                    <td className="px-6 py-3 text-right text-green-700 font-medium">
                      {r.valor > 0 ? formatearMoneda(r.valor) : '-'}
                    </td>
                    <td className="px-6 py-3 text-right text-gray-500">{r.min_stock_alert ?? '-'}</td>
                    <td className="px-6 py-3">
                      {!hidden && cls.label && (
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${
                          cls.label === 'REPONER' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                        }`}>
                          {cls.label}
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {unmatched.length > 0 && (
        <div className="mt-6 bg-amber-50 border border-amber-200 rounded-xl p-4">
          <h2 className="text-sm font-semibold text-amber-800 mb-2">
            Pendientes sin match ({unmatched.reduce((s, u) => s + u.pendientes, 0)} ordenes no contabilizadas)
          </h2>
          <p className="text-xs text-amber-600 mb-3">
            Estos product_name de store_orders no pudieron mapearse a ningun modelo del catalogo. Sus pendientes no se estan sumando.
          </p>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-amber-200">
                <th className="text-left py-1 px-2 text-amber-700">product_name en store_orders</th>
                <th className="text-right py-1 px-2 text-amber-700">Pendientes</th>
                <th className="text-left py-1 px-2 text-amber-700">Clave generada</th>
              </tr>
            </thead>
            <tbody>
              {unmatched.map((u) => (
                <tr key={u.product_name} className="border-b border-amber-100">
                  <td className="py-1 px-2 text-gray-800 font-mono">{u.product_name}</td>
                  <td className="py-1 px-2 text-right font-semibold text-amber-800">{u.pendientes}</td>
                  <td className="py-1 px-2 text-gray-500 font-mono">{u.key}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-gray-400 mt-3">
        * &quot;Pendientes de asignar&quot; cuenta ordenes pagadas en GOcelular cuyo IMEI aun no fue vinculado.
        El match se hace por <code className="bg-gray-100 px-1 rounded">product_name</code> de store_orders contra el catalogo de modelos.
      </p>
    </>
  )
}
