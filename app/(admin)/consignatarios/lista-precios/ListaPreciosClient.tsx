'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { formatearMoneda } from '@/lib/utils'
import { actualizarMup, toggleVisibilidadListaPrecios } from '@/lib/actions/lista-precios'
import type { ProductoConPrecio } from '@/lib/actions/lista-precios'

interface Props {
  productos: ProductoConPrecio[]
  mupInicial: number
}

export default function ListaPreciosClient({ productos, mupInicial }: Props) {
  const [mup, setMup] = useState(mupInicial)
  const [savingMup, startSavingMup] = useTransition()
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const router = useRouter()

  function handleMupChange(value: number) {
    setMup(value)
  }

  function handleMupBlur() {
    startSavingMup(async () => {
      await actualizarMup(mup)
      router.refresh()
    })
  }

  async function handleToggle(productoId: string, currentOculto: boolean) {
    setTogglingId(productoId)
    await toggleVisibilidadListaPrecios(productoId, !currentOculto)
    router.refresh()
    setTogglingId(null)
  }

  function calcPrecioVenta(costo: number) {
    return Math.round(costo * (1 + mup / 100))
  }

  function calcIva(precioVenta: number) {
    return Math.round(precioVenta * 0.21)
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Lista de Precios</h1>
          <p className="text-sm text-gray-500 mt-1">Precios mayoristas de celulares con MUP configurable</p>
        </div>
        <a
          href="/api/pdf/lista-precios"
          target="_blank"
          className="inline-flex items-center gap-2 px-4 py-2 bg-magenta-600 text-white rounded-lg hover:bg-magenta-700 transition-colors text-sm font-medium"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Descargar PDF
        </a>
      </div>

      {/* MUP Config */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-4">
        <label className="text-sm font-medium text-gray-700">MUP (Margen de Utilidad):</label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={0}
            max={200}
            value={mup}
            onChange={(e) => handleMupChange(Number(e.target.value))}
            onBlur={handleMupBlur}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
            className="w-20 px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-center focus:ring-2 focus:ring-magenta-500 focus:border-transparent"
          />
          <span className="text-sm text-gray-600">%</span>
        </div>
        {savingMup && <span className="text-xs text-gray-400">Guardando...</span>}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-6 py-3 font-medium text-gray-600">Modelo</th>
              <th className="text-right px-6 py-3 font-medium text-gray-600">Precio Costo (Neto)</th>
              <th className="text-right px-6 py-3 font-medium text-gray-600">Precio Venta (Neto)</th>
              <th className="text-right px-6 py-3 font-medium text-gray-600">IVA (21%)</th>
              <th className="text-right px-6 py-3 font-medium text-gray-600">Precio con IVA</th>
              <th className="text-center px-6 py-3 font-medium text-gray-600">Visible</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {productos.map((p) => {
              const precioVenta = calcPrecioVenta(p.mejor_precio)
              const iva = calcIva(precioVenta)
              const precioConIva = precioVenta + iva
              const oculto = p.oculto_lista_precios

              return (
                <tr
                  key={p.id}
                  className={`hover:bg-gray-50 transition-colors ${oculto ? 'opacity-40' : ''}`}
                >
                  <td className={`px-6 py-3 font-medium text-gray-900 ${oculto ? 'line-through' : ''}`}>
                    {p.nombre}
                  </td>
                  <td className="px-6 py-3 text-right text-gray-700 tabular-nums">
                    {formatearMoneda(p.mejor_precio)}
                  </td>
                  <td className="px-6 py-3 text-right font-medium text-gray-900 tabular-nums">
                    {formatearMoneda(precioVenta)}
                  </td>
                  <td className="px-6 py-3 text-right text-gray-500 tabular-nums">
                    {formatearMoneda(iva)}
                  </td>
                  <td className="px-6 py-3 text-right font-bold text-magenta-700 tabular-nums">
                    {formatearMoneda(precioConIva)}
                  </td>
                  <td className="px-6 py-3 text-center">
                    <button
                      onClick={() => handleToggle(p.id, oculto)}
                      disabled={togglingId === p.id}
                      className="p-1 rounded hover:bg-gray-100 transition-colors disabled:opacity-50"
                      title={oculto ? 'Mostrar en lista' : 'Ocultar de lista'}
                    >
                      {oculto ? (
                        <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L6.5 6.5m3.378 3.378L6.5 6.5m7.621 7.621L17.5 17.5m-3.379-3.379L17.5 17.5M3 3l18 18" />
                        </svg>
                      ) : (
                        <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      )}
                    </button>
                  </td>
                </tr>
              )
            })}
            {productos.length === 0 && (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-gray-400">
                  No hay productos con precios cargados
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
