'use client'

import { useState, useTransition } from 'react'
import { ocultarModelo, mostrarModelo } from '@/lib/actions/kits-ocultos'
import { formatearMoneda } from '@/lib/utils'
import ExistenciasMensuales from '@/components/inventario/ExistenciasMensuales'
import type { CierreMensual } from '@/lib/actions/accesorios-ventas'

interface Item {
  modelo: string
  compras: number
  ventas: number
  disponible: number
  stockCelulares: number
  precioUnitario: number
  valuacion: number
}

interface Props {
  items: Item[]
  modelosOcultos: string[]
  cierres: CierreMensual[]
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

export default function KitsTable({ items, modelosOcultos, cierres }: Props) {
  const [mostrarOcultos, setMostrarOcultos] = useState(false)
  const [ocultos, setOcultos] = useState<Set<string>>(
    new Set(modelosOcultos.map(m => m.toLowerCase()))
  )
  const [, startTransition] = useTransition()

  function esOculto(modelo: string) {
    return ocultos.has(modelo.toLowerCase())
  }

  function handleToggle(modelo: string) {
    const hidden = esOculto(modelo)
    setOcultos(prev => {
      const next = new Set(prev)
      if (hidden) next.delete(modelo.toLowerCase())
      else next.add(modelo.toLowerCase())
      return next
    })
    startTransition(async () => {
      if (hidden) await mostrarModelo(modelo)
      else await ocultarModelo(modelo)
    })
  }

  const visibleItems = items.filter(r => !esOculto(r.modelo))
  const hiddenCount = items.filter(r => esOculto(r.modelo)).length

  const totalCompras = visibleItems.reduce((s, r) => s + r.compras, 0)
  const totalVentas = visibleItems.reduce((s, r) => s + r.ventas, 0)
  const totalDisponible = visibleItems.reduce((s, r) => s + r.disponible, 0)
  const totalValuacion = visibleItems.reduce((s, r) => s + r.valuacion, 0)
  const totalStockCel = visibleItems.reduce((s, r) => s + r.stockCelulares, 0)

  const displayedItems = mostrarOcultos ? items : visibleItems

  return (
    <>
      {/* Resumen */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4 flex flex-wrap gap-3 md:gap-6 text-sm">
        <div>
          <p className="text-xs text-gray-500">Modelos</p>
          <p className="font-bold text-gray-900">{visibleItems.length}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Compras</p>
          <p className="font-bold text-blue-700">{totalCompras}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Ventas</p>
          <p className="font-bold text-amber-700">{totalVentas}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Kits disponibles</p>
          <p className={`font-bold ${totalDisponible < 0 ? 'text-red-700' : 'text-green-700'}`}>{totalDisponible}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Stock celulares</p>
          <p className="font-bold text-purple-700">{totalStockCel}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Valuación</p>
          <p className="font-bold text-green-700">{formatearMoneda(totalValuacion)}</p>
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

      {items.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center text-gray-400 text-sm">
          Sin kits recibidos. Los pedidos de &quot;Kits de Seguridad&quot; marcados como recibidos aparecerán aquí.
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="w-10 px-2 py-3" />
                <th className="text-right px-4 py-3 font-medium text-purple-700 bg-purple-50">Stock cel.</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Modelo</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Compras</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Ventas</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Kits disp.</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Precio unit.</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Valuación</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {displayedItems.map((r) => {
                const hidden = esOculto(r.modelo)
                const faltanKits = r.stockCelulares > r.disponible
                return (
                  <tr
                    key={r.modelo}
                    className={`hover:bg-gray-50 ${hidden ? 'opacity-40' : ''} ${!hidden && r.disponible < 0 ? 'bg-red-50' : !hidden && faltanKits ? 'bg-amber-50' : ''}`}
                  >
                    <td className="px-2 py-3 text-center">
                      <button
                        onClick={() => handleToggle(r.modelo)}
                        title={hidden ? 'Mostrar modelo' : 'Ocultar modelo'}
                        className="text-gray-400 hover:text-gray-600 transition-colors"
                      >
                        {hidden ? <EyeOffIcon /> : <EyeIcon />}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-purple-700 bg-purple-50/50">
                      {r.stockCelulares}
                    </td>
                    <td className="px-5 py-3 font-medium text-gray-900">{r.modelo}</td>
                    <td className="px-4 py-3 text-right font-semibold text-blue-700">{r.compras}</td>
                    <td className="px-4 py-3 text-right text-amber-700">{r.ventas}</td>
                    <td className={`px-4 py-3 text-right font-bold ${r.disponible < 0 ? 'text-red-700' : 'text-green-700'}`}>
                      {r.disponible}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600">{formatearMoneda(r.precioUnitario)}</td>
                    <td className="px-4 py-3 text-right text-green-700 font-medium">
                      {r.valuacion > 0 ? formatearMoneda(r.valuacion) : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot className="bg-gray-50 border-t border-gray-200">
              <tr className="font-semibold">
                <td className="px-2 py-3" />
                <td className="px-4 py-3 text-right text-purple-700 bg-purple-50/50">{totalStockCel}</td>
                <td className="px-5 py-3 text-gray-900">Total</td>
                <td className="px-4 py-3 text-right text-blue-700">{totalCompras}</td>
                <td className="px-4 py-3 text-right text-amber-700">{totalVentas}</td>
                <td className={`px-4 py-3 text-right ${totalDisponible < 0 ? 'text-red-700' : 'text-green-700'}`}>{totalDisponible}</td>
                <td className="px-4 py-3" />
                <td className="px-4 py-3 text-right text-green-700">{formatearMoneda(totalValuacion)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <p className="text-xs text-gray-400 mt-3 mb-6">
        * &quot;Stock cel.&quot; muestra celulares disponibles en inventario GOcelular para cada modelo.
        Si el stock de celulares supera los kits disponibles, aparece REPONER.
      </p>

      <ExistenciasMensuales cierres={cierres} categoria="kits de seguridad" />
    </>
  )
}
