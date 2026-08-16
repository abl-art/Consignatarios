'use client'

import { useState } from 'react'
import type { StockWarehouseRow } from '@/lib/gocelular'

// A partir de estos dias en transito el lote deja de ser un envio en curso y pasa a ser
// un dato trabado: las unidades no estan en ningun deposito y no suman al total de stock.
export const DIAS_TRANSITO_TRABADO = 10

export function diasDesde(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
}

export default function StockTable({ rows }: { rows: StockWarehouseRow[] }) {
  const [filtro, setFiltro] = useState('')
  const [tipoFiltro, setTipoFiltro] = useState<'todos' | 'celular' | 'accesorio'>('todos')

  const filtered = rows.filter(r => {
    if (tipoFiltro !== 'todos' && r.tipo !== tipoFiltro) return false
    if (filtro) {
      const q = filtro.toLowerCase()
      return r.nombre.toLowerCase().includes(q) || r.sku.toLowerCase().includes(q)
    }
    return true
  })

  return (
    <div>
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <input
          type="text"
          placeholder="Buscar por SKU o nombre..."
          value={filtro}
          onChange={e => setFiltro(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm flex-1"
        />
        <select
          value={tipoFiltro}
          onChange={e => setTipoFiltro(e.target.value as 'todos' | 'celular' | 'accesorio')}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
        >
          <option value="todos">Todos</option>
          <option value="celular">Celulares</option>
          <option value="accesorio">Accesorios</option>
        </select>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-900 text-white text-xs">
                <th className="px-4 py-3 text-left font-medium">SKU</th>
                <th className="px-4 py-3 text-left font-medium">Nombre</th>
                <th className="px-4 py-3 text-right font-medium">WH Andreani</th>
                <th className="px-4 py-3 text-right font-medium">WH GOcuotas</th>
                <th className="px-4 py-3 text-right font-medium">En tránsito</th>
                <th className="px-4 py-3 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((r, i) => (
                <tr key={`${r.sku}-${r.nombre}-${i}`} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 font-mono text-xs text-gray-600">{r.sku}</td>
                  <td className="px-4 py-2.5 text-gray-900">
                    {r.nombre}
                    {r.tipo === 'accesorio' && (
                      <span className="ml-2 text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full">
                        accesorio
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{r.whAndreani || '—'}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{r.whGocuotas || '—'}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {r.enTransito ? (() => {
                      const dias = r.enTransitoDesde ? diasDesde(r.enTransitoDesde) : null
                      const trabado = dias !== null && dias >= DIAS_TRANSITO_TRABADO
                      return (
                        <span
                          className={trabado ? 'text-red-600 font-semibold' : 'text-amber-600'}
                          title={trabado
                            ? `La unidad más vieja lleva ${dias} días en tránsito: revisar si ya está en el depósito y quedó sin actualizar`
                            : dias !== null ? `La unidad más vieja lleva ${dias} días en tránsito` : undefined}
                        >
                          {r.enTransito}
                          {trabado && <span className="ml-1">⚠</span>}
                        </span>
                      )
                    })() : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right font-semibold tabular-nums">{r.total}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                    No se encontraron productos
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 font-semibold text-sm">
                <td className="px-4 py-3" colSpan={2}>
                  Total ({filtered.length} items)
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {filtered.reduce((s, r) => s + r.whAndreani, 0).toLocaleString()}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {filtered.reduce((s, r) => s + r.whGocuotas, 0).toLocaleString()}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-amber-600">
                  {filtered.reduce((s, r) => s + r.enTransito, 0).toLocaleString()}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {filtered.reduce((s, r) => s + r.total, 0).toLocaleString()}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  )
}
