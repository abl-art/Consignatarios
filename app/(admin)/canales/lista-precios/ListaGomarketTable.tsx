'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { setMultiploListaPrecios, setMultiploDefaultGomarket } from '@/lib/actions/lista-precios-canales'
import type { FilaGomarket } from '@/lib/lista-precios-gomarket'

// Lista de precios de la tienda GOmarket. El PVP se publica A MANO en el
// admin de GOmarket — la columna "Tienda GOmarket" trae el precio real
// publicado y la Dif marca el desvío contra el PVP sugerido.

const peso = (n: number) => `$${Math.round(n).toLocaleString('es-AR')}`

function InputMultiplo({ fila }: { fila: FilaGomarket }) {
  const router = useRouter()
  const [valor, setValor] = useState(String(fila.multiplo))

  const guardar = async () => {
    const n = Number(valor.replace(',', '.'))
    if (!Number.isFinite(n) || n <= 0 || n === fila.multiplo) {
      setValor(String(fila.multiplo))
      return
    }
    await setMultiploListaPrecios(fila.productoId, n)
    router.refresh()
  }

  return (
    <input
      value={valor}
      onChange={e => setValor(e.target.value)}
      onBlur={guardar}
      onKeyDown={e => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      className="w-16 border border-gray-300 rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-1 focus:ring-gray-400"
    />
  )
}

function InputMultiploDefault({ valor: inicial }: { valor: number }) {
  const router = useRouter()
  const [valor, setValor] = useState(String(inicial))

  const guardar = async () => {
    const n = Number(valor.replace(',', '.'))
    if (!Number.isFinite(n) || n <= 0 || n === inicial) {
      setValor(String(inicial))
      return
    }
    await setMultiploDefaultGomarket(n)
    router.refresh()
  }

  return (
    <label className="flex items-center gap-2 text-xs text-gray-500">
      Múltiplo default GOmarket
      <input
        value={valor}
        onChange={e => setValor(e.target.value)}
        onBlur={guardar}
        onKeyDown={e => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        className="w-16 border border-gray-300 rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-1 focus:ring-gray-400"
        title="Aplica a todos los productos GOmarket sin múltiplo propio"
      />
    </label>
  )
}

function ChipDif({ difPct }: { difPct: number | null }) {
  if (difPct === null) return <span className="text-gray-400 text-xs">—</span>
  const ok = Math.abs(difPct) <= 1
  return (
    <span
      className={`inline-block px-1.5 py-0.5 rounded-full border text-[11px] font-medium ${
        ok ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'
      }`}
      title="Diferencia entre el precio publicado en GOmarket y el PVP sugerido"
    >
      {difPct > 0 ? '+' : ''}{difPct.toLocaleString('es-AR')}%
    </span>
  )
}

export default function ListaGomarketTable({
  filas,
  categorias,
  multiploDefault,
}: {
  filas: FilaGomarket[]
  categorias: string[]
  multiploDefault: number
}) {
  const [categoria, setCategoria] = useState<string>('todas')

  // Pills SIEMPRE con las categorías del propio GOmarket (sync de commerce);
  // por las dudas se suman las que aparezcan en filas y no estén en el sync
  const pills = useMemo(() => {
    const extra = [...new Set(filas.map(f => f.categoria).filter((c): c is string => !!c))].filter(
      c => !categorias.includes(c),
    )
    return [...categorias, ...extra]
  }, [filas, categorias])

  const visibles = categoria === 'todas' ? filas : filas.filter(f => f.categoria === categoria)

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-1 flex-wrap">
          <button
            onClick={() => setCategoria('todas')}
            className={`px-3 py-1 text-xs font-medium rounded-full border transition-colors ${
              categoria === 'todas'
                ? 'bg-violet-600 text-white border-violet-600'
                : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
            }`}
          >
            Todas
          </button>
          {pills.map(c => (
            <button
              key={c}
              onClick={() => setCategoria(c)}
              className={`px-3 py-1 text-xs font-medium rounded-full border transition-colors ${
                categoria === c
                  ? 'bg-violet-600 text-white border-violet-600'
                  : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
        <InputMultiploDefault valor={multiploDefault} />
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200 text-left">
              <th className="px-4 py-2 font-medium text-gray-600">Producto</th>
              <th className="px-4 py-2 font-medium text-gray-600">Categoría</th>
              <th className="px-4 py-2 font-medium text-gray-600 text-right">Costo</th>
              <th className="px-4 py-2 font-medium text-gray-600 text-right">Múltiplo</th>
              <th className="px-4 py-2 font-medium text-gray-600 text-right">PVP sugerido</th>
              <th className="px-4 py-2 font-medium text-gray-600 text-right">Cuota (÷9)</th>
              <th className="px-4 py-2 font-medium text-gray-600 text-right">Tienda GOmarket</th>
              <th className="px-4 py-2 font-medium text-gray-600 text-center">Dif</th>
            </tr>
          </thead>
          <tbody>
            {visibles.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-gray-500">
                  Sin productos GOmarket{categoria !== 'todas' ? ' en esta categoría' : ''} — se sincronizan solos
                  desde el admin de GOmarket.
                </td>
              </tr>
            )}
            {visibles.map(f => (
              <tr key={f.productoId} className="border-b border-gray-100 last:border-0">
                <td className="px-4 py-2">
                  <div className="text-gray-900">{f.nombre}</div>
                  {f.codigo && <div className="font-mono text-[10px] text-gray-400">{f.codigo}</div>}
                </td>
                <td className="px-4 py-2 text-gray-600">{f.categoria ?? '—'}</td>
                <td className="px-4 py-2 text-right">
                  {f.costo ? (
                    <div>
                      <div className="font-medium text-gray-900">{peso(f.costo.precio)}</div>
                      <div className="text-[10px] text-gray-400">{f.costo.proveedor}</div>
                    </div>
                  ) : (
                    <Link
                      href="/compras/modelos"
                      className="text-xs font-medium text-red-600 hover:underline"
                      title="Este producto no tiene costo de proveedor cargado — cargalo en Compras → Modelos"
                    >
                      sin costo →
                    </Link>
                  )}
                </td>
                <td className="px-4 py-2 text-right">
                  <InputMultiplo fila={f} />
                </td>
                <td className="px-4 py-2 text-right font-bold text-gray-900">{f.pvp !== null ? peso(f.pvp) : '—'}</td>
                <td className="px-4 py-2 text-right text-gray-600">{f.cuota !== null ? peso(f.cuota) : '—'}</td>
                <td className="px-4 py-2 text-right">
                  {f.precioTienda !== null ? (
                    <span className="font-medium text-violet-700">{peso(f.precioTienda)}</span>
                  ) : (
                    <span className="text-gray-400 text-xs" title="Sin listing publicado en GOmarket todavía">—</span>
                  )}
                </td>
                <td className="px-4 py-2 text-center">
                  <ChipDif difPct={f.difPct} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-400 mt-3">
        El PVP de GOmarket se publica a mano en su admin — esta lista sugiere el precio (costo × múltiplo, cuota de 9
        redondeada a $100) y la columna Dif avisa si lo publicado quedó desalineado.
      </p>
    </div>
  )
}
