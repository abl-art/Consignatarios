'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { FilaListaPrecios } from '@/lib/lista-precios'
import { setMultiploListaPrecios, setBonoListaPrecios } from '@/lib/actions/lista-precios-canales'

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

function fechaCorta(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${Number(d)}/${Number(m)}`
}

function BonoEditor({ fila }: { fila: FilaListaPrecios }) {
  const router = useRouter()
  const [editando, setEditando] = useState(false)
  const [monto, setMonto] = useState(fila.bonoMonto ? String(fila.bonoMonto) : '')
  const [desde, setDesde] = useState(fila.bonoDesde ?? '')
  const [hasta, setHasta] = useState(fila.bonoHasta ?? '')
  const [cupo, setCupo] = useState(fila.bonoCupo ? String(fila.bonoCupo) : '')
  const [, startTransition] = useTransition()

  const guardar = (quitar = false) => {
    const n = Number(monto.replace(/\./g, '').replace(',', '.'))
    const c = Number(cupo)
    startTransition(async () => {
      await setBonoListaPrecios(
        fila.productoId,
        quitar || !(n > 0)
          ? null
          : { monto: n, desde: desde || undefined, hasta: hasta || undefined, cupo: c > 0 ? Math.floor(c) : undefined },
      )
      setEditando(false)
      router.refresh()
    })
  }

  if (!editando) {
    if (fila.bonoMonto) {
      return (
        <button
          onClick={() => setEditando(true)}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-violet-200 bg-violet-50 text-violet-700 text-xs font-semibold hover:border-violet-400"
          title="Editar bono"
        >
          {peso(fila.bonoMonto)}{fila.bonoHasta && ` → ${fechaCorta(fila.bonoHasta)}`}
          {fila.bonoCupo !== null && ` · ${fila.bonoVendidas}/${fila.bonoCupo} u.`}
        </button>
      )
    }
    if (fila.bonoEstado === 'agotado') {
      // El bono llenó el cupo antes del vencimiento: el descuento ya no corre.
      // El + carga la campaña siguiente (la agotada queda en el historial).
      return (
        <span className="inline-flex items-center gap-1">
          <span
            className="inline-flex items-center px-2 py-0.5 rounded-full border border-amber-300 bg-amber-50 text-amber-700 text-xs font-semibold"
            title={`Cupo alcanzado: ${fila.bonoVendidas}/${fila.bonoCupo} unidades — reajustar el precio de la tienda`}
          >
            Cupo alcanzado {fila.bonoVendidas}/{fila.bonoCupo}
          </span>
          <button onClick={() => setEditando(true)} className="text-gray-300 hover:text-gray-500 text-sm font-bold px-1" title="Agregar bono nuevo">+</button>
        </span>
      )
    }
    return (
      <button
        onClick={() => setEditando(true)}
        className="text-gray-300 hover:text-gray-500 text-sm font-bold px-2"
        title="Agregar bono"
      >
        +
      </button>
    )
  }

  return (
    <div className="flex items-center gap-1 justify-end">
      <input
        type="text" inputMode="numeric" value={monto} onChange={e => setMonto(e.target.value)}
        placeholder="$ c/IVA" autoFocus
        className="w-20 px-2 py-1 border border-gray-300 rounded-lg text-right text-xs tabular-nums focus:outline-none focus:ring-2 focus:ring-violet-500"
      />
      <input
        type="date" value={desde} onChange={e => setDesde(e.target.value)}
        title="Vigente desde (vacío = desde hoy)"
        className="px-1.5 py-1 border border-gray-300 rounded-lg text-xs text-gray-600 focus:outline-none focus:ring-2 focus:ring-violet-500"
      />
      <input
        type="date" value={hasta} onChange={e => setHasta(e.target.value)}
        title="Vigente hasta"
        className="px-1.5 py-1 border border-gray-300 rounded-lg text-xs text-gray-600 focus:outline-none focus:ring-2 focus:ring-violet-500"
      />
      <input
        type="text" inputMode="numeric" value={cupo} onChange={e => setCupo(e.target.value)}
        placeholder="cupo u." title="Cupo: unidades máximas que reconoce la marca (vacío = sin cupo)"
        className="w-14 px-2 py-1 border border-gray-300 rounded-lg text-right text-xs tabular-nums focus:outline-none focus:ring-2 focus:ring-violet-500"
      />
      <button onClick={() => guardar()} className="px-1.5 py-1 text-xs font-bold text-green-700 hover:bg-green-50 rounded" title="Guardar">✓</button>
      <button onClick={() => guardar(true)} className="px-1.5 py-1 text-xs font-bold text-red-600 hover:bg-red-50 rounded" title="Quitar bono">✕</button>
    </div>
  )
}

export default function ListaPreciosTable({ filas }: { filas: FilaListaPrecios[] }) {
  const [marca, setMarca] = useState<string | null>(null)
  const marcas = [...new Set(filas.map(f => f.marca))].sort()
  const conBono = filas.filter(f => f.bonoMonto !== null || f.bonoEstado === 'agotado')
  const visibles = marca === '__bonos' ? conBono : marca ? filas.filter(f => f.marca === marca) : filas

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
        {conBono.length > 0 && (
          <button
            onClick={() => setMarca('__bonos')}
            className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${
              marca === '__bonos' ? 'bg-violet-700 text-white border-violet-700' : 'bg-violet-50 text-violet-700 border-violet-200 hover:border-violet-400'
            }`}
          >
            Bonos ({conBono.length})
          </button>
        )}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Modelo</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Costo s/IVA</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Múltiplo</th>
              <th className="text-right px-4 py-3 font-medium text-gray-900 bg-gray-100">PVP</th>
              <th className="text-right px-4 py-3 font-medium text-gray-900 bg-gray-100">Cuota (9)</th>
              <th className="text-right px-4 py-3 font-medium text-violet-700 bg-violet-50">Bono</th>
              <th className="text-right px-4 py-3 font-medium text-violet-700 bg-violet-50">PVP c/bono</th>
              <th className="text-right px-4 py-3 font-medium text-violet-700 bg-violet-50">Cuota c/bono</th>
              <th className="text-right px-4 py-3 font-medium text-violet-700 bg-violet-50">NC/u</th>
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
                  <span className="block text-xs text-gray-400">
                    {f.codigo && <span className="font-mono">{f.codigo} · </span>}
                    {f.proveedor ? (
                      <span
                        className={f.proveedorPreferido ? undefined : 'text-amber-600 font-medium'}
                        title={f.proveedorPreferido ? undefined : 'El proveedor preferido de la marca no tiene precio: se usa el más barato del resto'}
                      >
                        {f.proveedor}{!f.proveedorPreferido && ' *'}
                      </span>
                    ) : (
                      <span className="text-red-600 font-medium">sin precio</span>
                    )}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-gray-600">{f.costo !== null ? peso(f.costo) : '—'}</td>
                <td className="px-4 py-2.5 text-right"><InputMultiplo fila={f} /></td>
                <td className={`px-4 py-2.5 text-right tabular-nums bg-gray-50 ${f.pvpConBono !== null ? 'text-gray-400 line-through' : 'font-bold text-gray-900'}`}>{f.pvp !== null ? peso(f.pvp) : '—'}</td>
                <td className={`px-4 py-2.5 text-right tabular-nums bg-gray-50 ${f.pvpConBono !== null ? 'text-gray-400 line-through' : 'font-semibold text-gray-900'}`}>{f.cuota !== null ? peso(f.cuota) : '—'}</td>
                <td className="px-4 py-2.5 text-right bg-violet-50/40"><BonoEditor fila={f} /></td>
                <td className="px-4 py-2.5 text-right tabular-nums font-bold text-violet-800 bg-violet-50/40">{f.pvpConBono !== null ? peso(f.pvpConBono) : '—'}</td>
                <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-violet-800 bg-violet-50/40">{f.cuotaConBono !== null ? peso(f.cuotaConBono) : '—'}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-violet-700 bg-violet-50/40">{f.ncEsperada !== null ? peso(f.ncEsperada) : '—'}</td>
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
        * Proveedor alternativo (el preferido de la marca no tiene precio cargado). Dif. = Precio Tienda − PVP
        vigente (con bono si hay): en rojo, la tienda está vendiendo abajo del precio objetivo. Bono = monto con
        IVA a nivel PVP, por modelo y con vencimiento; la cuota con bono también se redondea a centenas para
        arriba. NC/u = nota de crédito esperada de la marca por unidad (bono ÷ múltiplo, neto de IVA y margen).
      </p>
    </div>
  )
}
