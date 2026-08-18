'use client'

import { useState } from 'react'
import type { StockDisponibilidadRow } from '@/lib/disponibilidad'

import { DIAS_TRANSITO_TRABADO, diasDesde } from '@/lib/transito'
import { categoriaAccesorio, type CategoriaAccesorio } from '@/lib/categoria-accesorio'

type TipoFiltro = 'todos' | 'celular' | 'accesorio' | CategoriaAccesorio

export default function StockTable({ rows }: { rows: StockDisponibilidadRow[] }) {
  const [filtro, setFiltro] = useState('')
  const [tipoFiltro, setTipoFiltro] = useState<TipoFiltro>('todos')
  const [marcaFiltro, setMarcaFiltro] = useState('todas')

  const marcas = Array.from(new Set(rows.map(r => r.marca).filter((m): m is string => !!m))).sort()

  const filtered = rows.filter(r => {
    if (tipoFiltro === 'celular' || tipoFiltro === 'accesorio') {
      if (r.tipo !== tipoFiltro) return false
    } else if (tipoFiltro !== 'todos') {
      if (r.tipo !== 'accesorio' || categoriaAccesorio(r.sku, r.nombre) !== tipoFiltro) return false
    }
    if (marcaFiltro !== 'todas' && r.marca !== marcaFiltro) return false
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
          onChange={e => setTipoFiltro(e.target.value as TipoFiltro)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
        >
          <option value="todos">Todos</option>
          <option value="celular">Celulares</option>
          <option value="accesorio">Accesorios (todos)</option>
          <option value="kit">— Kits de seguridad</option>
          <option value="auricular">— Auriculares</option>
          <option value="parlante">— Parlantes</option>
          <option value="smartwatch">— Smartwatches</option>
        </select>
        <select
          value={marcaFiltro}
          onChange={e => setMarcaFiltro(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
        >
          <option value="todas">Todas las marcas</option>
          {marcas.map(m => (
            <option key={m} value={m}>{m}</option>
          ))}
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
                <th className="px-4 py-3 text-right font-medium" title="Órdenes pagas con envío propio, sin entregar y sin IMEI asignado">Pend. GO</th>
                <th className="px-4 py-3 text-right font-medium" title="Pedidos en el warehouse de Andreani aún no expedidos (sin IMEI asignado)">Pend. Andreani</th>
                <th className="px-4 py-3 text-right font-medium" title="WH Andreani + WH GOcuotas − pendientes">Disponible real</th>
                <th className="px-4 py-3 text-right font-medium">En tránsito</th>
                <th className="px-4 py-3 text-right font-medium" title="Comprado en el gestor de pedidos, aún no informado a GOcelular (al informarse pasa a En tránsito)">Pedido</th>
                <th className="px-4 py-3 text-right font-medium" title="Disponible real + en tránsito + pedido">Próxima disponib.</th>
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
                  <td className="px-4 py-2.5 text-right tabular-nums text-gray-500">{r.pendGocuotas || '—'}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-gray-500">{r.pendAndreani || '—'}</td>
                  <td className={`px-4 py-2.5 text-right font-semibold tabular-nums ${r.disponibleReal < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                    {r.disponibleReal}
                  </td>
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
                  <td className="px-4 py-2.5 text-right tabular-nums text-blue-600">{r.pedido || '—'}</td>
                  <td className={`px-4 py-2.5 text-right font-semibold tabular-nums ${r.proximaDisponibilidad < 0 ? 'text-red-600' : ''}`}>
                    {r.proximaDisponibilidad}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-gray-400">
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
                <td className="px-4 py-3 text-right tabular-nums text-gray-500">
                  {filtered.reduce((s, r) => s + r.pendGocuotas, 0).toLocaleString()}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-gray-500">
                  {filtered.reduce((s, r) => s + r.pendAndreani, 0).toLocaleString()}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {filtered.reduce((s, r) => s + r.disponibleReal, 0).toLocaleString()}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-amber-600">
                  {filtered.reduce((s, r) => s + r.enTransito, 0).toLocaleString()}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-blue-600">
                  {filtered.reduce((s, r) => s + r.pedido, 0).toLocaleString()}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {filtered.reduce((s, r) => s + r.proximaDisponibilidad, 0).toLocaleString()}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  )
}
