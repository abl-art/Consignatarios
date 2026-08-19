'use client'

import { useState } from 'react'
import type { CoberturaModelo } from '@/lib/inventario-indicadores'

export interface FilaIndicador {
  key: string
  label: string
  vel7: number
  vel30: number
  cobertura: number | null
  rotacion: number | null
  modelos: CoberturaModelo[]
}

interface Props {
  meses: number | null
  filas: FilaIndicador[]
}

const fmt1 = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 })
const fmt2 = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 })

export default function IndicadoresProducto({ meses, filas }: Props) {
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set())

  const toggle = (key: string) => {
    setAbiertos(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <h2 className="text-sm font-semibold text-gray-800">Indicadores por producto</h2>
        <div className="flex items-baseline gap-2">
          <span className="text-xs text-gray-500">Meses de Stock</span>
          <span className="text-2xl font-bold text-gray-900">{meses !== null ? fmt1.format(meses) : '—'}</span>
          <span className="text-[10px] text-gray-400 hidden sm:inline">valorización ÷ venta mensual valorizada (30d)</span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs text-gray-500">
              <th className="py-1.5 px-2 font-medium">Producto</th>
              <th className="py-1.5 px-2 font-medium text-right">u/día 7d</th>
              <th className="py-1.5 px-2 font-medium text-right">u/día 30d</th>
              <th className="py-1.5 px-2 font-medium text-right">Cobertura</th>
              <th className="py-1.5 px-2 font-medium text-right">Rotación 30d</th>
            </tr>
          </thead>
          <tbody>
            {filas.map(f => {
              const abierto = abiertos.has(f.key)
              return (
                <FilaProducto key={f.key} fila={f} abierto={abierto} onToggle={() => toggle(f.key)} />
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-gray-400 mt-2">
        Cobertura: stock ÷ venta diaria 30d (en rojo si &lt;15 días) · Rotación: vendidas 30d ÷ stock promedio del mes · Meses de Stock pondera cada producto por su valor · Click en un producto para ver la cobertura por modelo
      </p>
    </div>
  )
}

function FilaProducto({ fila, abierto, onToggle }: { fila: FilaIndicador; abierto: boolean; onToggle: () => void }) {
  return (
    <>
      <tr
        className="border-b border-gray-100 cursor-pointer hover:bg-gray-50 select-none"
        onClick={onToggle}
      >
        <td className="py-1.5 px-2 text-gray-900">
          <span className={`inline-block w-3 text-gray-400 transition-transform ${abierto ? 'rotate-90' : ''}`}>▸</span>
          {fila.label}
          <span className="text-[10px] text-gray-400 ml-1.5">{fila.modelos.length} modelos</span>
        </td>
        <td className="py-1.5 px-2 text-right">{fmt1.format(fila.vel7)}</td>
        <td className="py-1.5 px-2 text-right">{fmt1.format(fila.vel30)}</td>
        <td className={`py-1.5 px-2 text-right font-medium ${fila.cobertura !== null && fila.cobertura < 15 ? 'text-red-600' : 'text-gray-900'}`}>
          {fila.cobertura !== null ? `${fmt1.format(fila.cobertura)} días` : '—'}
        </td>
        <td className="py-1.5 px-2 text-right">{fila.rotacion !== null ? `${fmt2.format(fila.rotacion)}×` : '—'}</td>
      </tr>
      {abierto && (
        <tr className="border-b border-gray-100 bg-gray-50/60">
          <td colSpan={5} className="py-2 px-2">
            {fila.modelos.length === 0 ? (
              <p className="text-xs text-gray-400 px-4 py-1">Sin desglose por modelo disponible</p>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-[10px] text-gray-400">
                    <th className="py-1 pl-6 pr-2 font-medium">Modelo</th>
                    <th className="py-1 px-2 font-medium text-right">Stock</th>
                    <th className="py-1 px-2 font-medium text-right">u/día 30d</th>
                    <th className="py-1 px-2 font-medium text-right">Cobertura</th>
                  </tr>
                </thead>
                <tbody>
                  {fila.modelos.map(m => (
                    <tr key={m.modelo} className="border-t border-gray-100">
                      <td className="py-1 pl-6 pr-2 text-gray-700">{m.modelo}</td>
                      <td className={`py-1 px-2 text-right ${m.stock === 0 ? 'text-red-600 font-medium' : ''}`}>{m.stock.toLocaleString('es-AR')}</td>
                      <td className="py-1 px-2 text-right text-gray-500">{m.ventaDiaria30 > 0 ? fmt1.format(m.ventaDiaria30) : '—'}</td>
                      <td className={`py-1 px-2 text-right font-medium ${m.cobertura !== null && m.cobertura < 15 ? 'text-red-600' : 'text-gray-700'}`}>
                        {m.cobertura !== null ? `${fmt1.format(m.cobertura)} días` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </td>
        </tr>
      )}
    </>
  )
}
