'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { FilaListaPrecios } from '@/lib/lista-precios'
import { setMultiploListaPrecios } from '@/lib/actions/lista-precios-canales'

const peso = (n: number) => `$${Math.round(n).toLocaleString('es-AR')}`

function InputMultiplo({ fila }: { fila: FilaListaPrecios }) {
  const router = useRouter()
  const [valor, setValor] = useState(String(fila.multiplo))
  const [, startTransition] = useTransition()

  const guardar = () => {
    const n = Number(valor.replace(',', '.'))
    if (!Number.isFinite(n) || n <= 0 || n === fila.multiplo) {
      setValor(String(fila.multiplo))
      return
    }
    startTransition(async () => {
      await setMultiploListaPrecios(fila.productoId, n)
      router.refresh()
    })
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      value={valor}
      onChange={e => setValor(e.target.value)}
      onBlur={guardar}
      onKeyDown={e => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      className={`w-16 px-2 py-1 border rounded-lg text-right text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-gray-900 ${
        fila.multiplo !== 2 ? 'border-blue-300 bg-blue-50 font-semibold' : 'border-gray-300'
      }`}
    />
  )
}

export default function ListaPreciosTable({ filas }: { filas: FilaListaPrecios[] }) {
  const [marca, setMarca] = useState<string | null>(null)
  const marcas = [...new Set(filas.map(f => f.marca))].sort()
  const visibles = marca ? filas.filter(f => f.marca === marca) : filas

  if (filas.length === 0) {
    return <p className="text-sm text-gray-500">No hay modelos con ventas en los últimos 30 días.</p>
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-4">
        {[null, ...marcas].map(m => (
          <button
            key={m ?? 'todas'}
            onClick={() => setMarca(m)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${
              marca === m ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
            }`}
          >
            {m ?? 'Todas'}
          </button>
        ))}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Modelo</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Proveedor</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Ventas 30d</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Costo s/IVA</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Múltiplo</th>
              <th className="text-right px-4 py-3 font-medium text-gray-900 bg-gray-100">PVP</th>
              <th className="text-right px-4 py-3 font-medium text-gray-900 bg-gray-100">Cuota (9)</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">MUP</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">MUP $</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Precio Tienda</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Dif.</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {visibles.map(f => (
              <tr key={f.productoId} className="hover:bg-gray-50">
                <td className="px-4 py-2.5">
                  <span className="font-medium text-gray-900">{f.nombre}</span>
                  {f.codigo && <span className="block text-xs text-gray-400 font-mono">{f.codigo}</span>}
                </td>
                <td className="px-4 py-2.5">
                  {f.proveedor ? (
                    <span className={`inline-block px-2 py-0.5 rounded-full border text-xs font-medium ${
                      f.proveedorPreferido
                        ? 'bg-gray-50 text-gray-600 border-gray-200'
                        : 'bg-amber-50 text-amber-700 border-amber-200'
                    }`} title={f.proveedorPreferido ? undefined : 'El proveedor preferido de la marca no tiene precio: se usa el más barato del resto'}>
                      {f.proveedor}{!f.proveedorPreferido && ' *'}
                    </span>
                  ) : (
                    <span className="text-xs text-red-600 font-medium">sin precio</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-gray-600">{f.ventas30d}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-gray-600">{f.costo !== null ? peso(f.costo) : '—'}</td>
                <td className="px-4 py-2.5 text-right"><InputMultiplo fila={f} /></td>
                <td className="px-4 py-2.5 text-right tabular-nums font-bold text-gray-900 bg-gray-50">{f.pvp !== null ? peso(f.pvp) : '—'}</td>
                <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-gray-900 bg-gray-50">{f.cuota !== null ? peso(f.cuota) : '—'}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-gray-600">{f.mup !== null ? f.mup.toFixed(2) : '—'}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-gray-600">{f.mupPesos !== null ? peso(f.mupPesos) : '—'}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-gray-600">{f.precioTienda !== null ? peso(f.precioTienda) : '—'}</td>
                <td className={`px-4 py-2.5 text-right tabular-nums font-semibold ${
                  f.diferencia === null ? 'text-gray-400' : f.diferencia < 0 ? 'text-red-600' : 'text-green-700'
                }`}>
                  {f.diferencia !== null ? peso(f.diferencia) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-400 mt-3">
        * Proveedor alternativo (el preferido de la marca no tiene precio cargado). Dif. = Precio Tienda − PVP:
        en rojo, la tienda está vendiendo abajo del precio objetivo.
      </p>
    </div>
  )
}
