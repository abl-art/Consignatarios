'use client'

// Pestaña Stock Celulares de la vista proveedor (/proveedor/kits): la misma
// disponibilidad por depósito que /inventario/stock pero SOLO celulares,
// solo lectura, con filtro por marca en píldoras y búsqueda.

import { useState } from 'react'
import type { StockDisponibilidadRow } from '@/lib/disponibilidad'

export default function StockCelulares({ rows }: { rows: StockDisponibilidadRow[] }) {
  const [marca, setMarca] = useState('todas')
  const [busqueda, setBusqueda] = useState('')

  const marcas = Array.from(new Set(rows.map(r => r.marca).filter((m): m is string => !!m))).sort()

  const filtered = rows.filter(r => {
    if (marca !== 'todas' && r.marca !== marca) return false
    if (busqueda) {
      const q = busqueda.toLowerCase()
      return r.nombre.toLowerCase().includes(q) || r.sku.toLowerCase().includes(q)
    }
    return true
  })

  const total = (f: (r: StockDisponibilidadRow) => number) => filtered.reduce((s, r) => s + f(r), 0)

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-3">
        {['todas', ...marcas].map(m => (
          <button
            key={m}
            onClick={() => setMarca(m)}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
              marca === m ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
            }`}
          >
            {m === 'todas' ? `Todas (${rows.length})` : `${m} (${rows.filter(r => r.marca === m).length})`}
          </button>
        ))}
      </div>

      <input
        type="text"
        placeholder="Buscar por SKU o modelo..."
        value={busqueda}
        onChange={e => setBusqueda(e.target.value)}
        className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full sm:w-80 mb-4"
      />

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-900 text-white text-xs">
                <th className="px-4 py-3 text-left font-medium">SKU</th>
                <th className="px-4 py-3 text-left font-medium">Modelo</th>
                <th className="px-4 py-3 text-right font-medium">WH Andreani</th>
                <th className="px-4 py-3 text-right font-medium">WH GOcuotas</th>
                <th className="px-4 py-3 text-right font-medium" title="Órdenes pagas esperando picking (GO + Andreani)">Pendientes</th>
                <th className="px-4 py-3 text-right font-medium" title="Depósitos − pendientes">Disponible real</th>
                <th className="px-4 py-3 text-right font-medium">En tránsito</th>
                <th className="px-4 py-3 text-right font-medium" title="Disponible real + en tránsito">Próxima disponib.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((r, i) => (
                <tr key={`${r.sku}-${i}`} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 font-mono text-xs text-gray-600">{r.sku}</td>
                  <td className="px-4 py-2.5 text-gray-900">{r.nombre}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{r.whAndreani || '—'}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{r.whGocuotas || '—'}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-gray-500">{r.pendGocuotas + r.pendAndreani || '—'}</td>
                  <td className={`px-4 py-2.5 text-right font-semibold tabular-nums ${r.disponibleReal < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                    {r.disponibleReal}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-amber-600">{r.enTransito || '—'}</td>
                  <td className="px-4 py-2.5 text-right font-semibold tabular-nums">{r.disponibleReal + r.enTransito}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-400">Sin modelos para ese filtro</td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 font-semibold text-sm">
                <td className="px-4 py-3" colSpan={2}>Total ({filtered.length} modelos)</td>
                <td className="px-4 py-3 text-right tabular-nums">{total(r => r.whAndreani).toLocaleString('es-AR')}</td>
                <td className="px-4 py-3 text-right tabular-nums">{total(r => r.whGocuotas).toLocaleString('es-AR')}</td>
                <td className="px-4 py-3 text-right tabular-nums text-gray-500">{total(r => r.pendGocuotas + r.pendAndreani).toLocaleString('es-AR')}</td>
                <td className="px-4 py-3 text-right tabular-nums">{total(r => r.disponibleReal).toLocaleString('es-AR')}</td>
                <td className="px-4 py-3 text-right tabular-nums text-amber-600">{total(r => r.enTransito).toLocaleString('es-AR')}</td>
                <td className="px-4 py-3 text-right tabular-nums">{total(r => r.disponibleReal + r.enTransito).toLocaleString('es-AR')}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
      <p className="text-xs text-gray-400 mt-2">
        Solo celulares · Pendientes = órdenes pagas esperando salir del depósito · Disponible real = depósitos − pendientes · En tránsito = viajando al warehouse de Andreani
      </p>
    </div>
  )
}
