'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { FilaHistorialBono } from '@/lib/lista-precios'
import { marcaNC } from '@/lib/notas-credito'
import { generarPdfBono } from '@/lib/actions/lista-precios-canales'

const peso = (n: number) => `$${Math.round(n).toLocaleString('es-AR')}`

function fechaCorta(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${Number(d)}/${Number(m)}/${y.slice(2)}`
}

const ESTADO_BADGE: Record<FilaHistorialBono['estado'], { label: string; cls: string }> = {
  vigente: { label: 'Vigente', cls: 'bg-green-50 text-green-700 border-green-200' },
  agotado: { label: 'Cupo alcanzado', cls: 'bg-amber-50 text-amber-700 border-amber-300' },
  vencido: { label: 'Vencido', cls: 'bg-gray-100 text-gray-500 border-gray-200' },
  futuro: { label: 'Futuro', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
}

function PdfCell({ bono }: { bono: FilaHistorialBono }) {
  const router = useRouter()
  const [generando, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const generar = () => {
    setError(null)
    startTransition(async () => {
      const r = await generarPdfBono(bono.id)
      if (r && 'error' in r && r.error) setError(r.error)
      router.refresh()
    })
  }

  if (generando) return <span className="text-xs text-gray-400">Generando…</span>
  return (
    <span className="inline-flex items-center gap-2">
      {bono.pdfUrl ? (
        <>
          <a
            href={bono.pdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-semibold text-violet-700 hover:underline"
            title={bono.pdfGeneradoAt ? `Generado el ${fechaCorta(bono.pdfGeneradoAt.slice(0, 10))}` : undefined}
          >
            Descargar
          </a>
          <button onClick={generar} className="text-xs text-gray-400 hover:text-gray-600" title="Regenerar con las ventas de hoy">
            ↻
          </button>
        </>
      ) : (
        <button
          onClick={generar}
          className="px-2 py-0.5 rounded-full border border-violet-200 bg-violet-50 text-violet-700 text-xs font-semibold hover:border-violet-400"
        >
          Generar
        </button>
      )}
      {error && <span className="text-xs text-red-600" title={error}>⚠</span>}
    </span>
  )
}

// Agotado cuenta como vigente para el filtro: la campaña sigue dentro de su
// vigencia aunque el cupo ya no descuente
type FiltroEstado = 'vigente' | 'vencido' | 'futuro'
const FILTROS: { valor: FiltroEstado; label: string }[] = [
  { valor: 'vigente', label: 'Vigentes' },
  { valor: 'vencido', label: 'Vencidos' },
  { valor: 'futuro', label: 'Futuros' },
]

function coincide(estado: FilaHistorialBono['estado'], filtro: FiltroEstado): boolean {
  return filtro === 'vigente' ? estado === 'vigente' || estado === 'agotado' : estado === filtro
}

export default function BonosHistorialTable({ bonos }: { bonos: FilaHistorialBono[] }) {
  const [filtro, setFiltro] = useState<FiltroEstado | null>(null)
  const [marca, setMarca] = useState<string | null>(null)

  if (bonos.length === 0) {
    return <p className="text-sm text-gray-500">Todavía no hay bonos cargados. Se cargan desde la columna Bono de la pestaña Lista.</p>
  }

  const marcas = [...new Set(bonos.map(b => marcaNC(b.nombreModelo)))].sort()
  const deMarca = marca ? bonos.filter(b => marcaNC(b.nombreModelo) === marca) : bonos
  const visibles = filtro ? deMarca.filter(b => coincide(b.estado, filtro)) : deMarca

  const pill = (activo: boolean) =>
    `px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${
      activo ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
    }`

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-2">
        {[null, ...marcas].map(m => (
          <button key={m ?? 'todas'} onClick={() => setMarca(m)} className={pill(marca === m)}>
            {m ?? 'Todas'}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 mb-4">
        {[null, ...FILTROS.map(f => f.valor)].map(v => {
          const label = v === null ? 'Todos' : FILTROS.find(f => f.valor === v)!.label
          const cantidad = v === null ? deMarca.length : deMarca.filter(b => coincide(b.estado, v)).length
          return (
            <button key={v ?? 'todos'} onClick={() => setFiltro(v)} className={pill(filtro === v)}>
              {label} ({cantidad})
            </button>
          )
        })}
      </div>
      <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Modelo</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Bono (c/IVA)</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Vigencia</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Cupo</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Vendidas</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Reconocidas</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Estado</th>
              <th className="text-right px-4 py-3 font-medium text-violet-700 bg-violet-50">NC/u</th>
              <th className="text-right px-4 py-3 font-medium text-violet-700 bg-violet-50">NC total</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">PDF prueba</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {visibles.map(b => (
              <tr key={b.id} className="hover:bg-gray-50">
                <td className="px-4 py-2.5 font-medium text-gray-900">{b.nombreModelo}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{peso(b.monto)}</td>
                <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">
                  {b.desde ? fechaCorta(b.desde) : '—'} → {b.hasta ? fechaCorta(b.hasta) : 'sin vto'}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-gray-600">{b.cupo ?? '—'}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-gray-600">{b.vendidas}</td>
                <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-gray-900">{b.reconocidas}</td>
                <td className="px-4 py-2.5">
                  <span className={`inline-flex px-2 py-0.5 rounded-full border text-xs font-semibold ${ESTADO_BADGE[b.estado].cls}`}>
                    {ESTADO_BADGE[b.estado].label}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-violet-700 bg-violet-50/40">{peso(b.ncUnitaria)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums font-bold text-violet-800 bg-violet-50/40">{peso(b.ncTotal)}</td>
                <td className="px-4 py-2.5"><PdfCell bono={b} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-400 mt-3">
        Vendidas = unidades propias (tienda GOcelular) dentro de la vigencia. Reconocidas = las que la marca
        reconoce para la NC (cortadas en el cupo). NC/u = bono ÷ múltiplo, neto de IVA y margen. El PDF lista
        fecha, IMEI, modelo y nro de factura de cada unidad reconocida; la factura se emite con unos días de
        demora — conviene generar el PDF definitivo unos días después del cierre.
      </p>
    </div>
  )
}
