'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { LineaPrecio, LineaRespuesta, PricesRespuesta } from '@/lib/gocelular-prices'
import { previewPublicacionPrecios, aplicarPublicacionPrecios } from '@/lib/actions/publicar-precios'

const peso = (s: string | undefined) => (s ? `$${Math.round(Number(s)).toLocaleString('es-AR')}` : '—')

const WARNING_LABEL: Record<string, string> = {
  no_headroom: 'sin stock ofertable',
  low_headroom: 'quedan 1-2 unidades',
  below_cost: 'debajo del costo registrado',
  compare_at_price_not_above: 'el precio tachado deja de mostrarse',
}

interface PreviewState {
  batchReference: string
  lineas: LineaPrecio[]
  detalle: LineaRespuesta[]
  sinMapear: string[]
  excluidas: string[]
}

export default function PublicarPrecios() {
  const router = useRouter()
  const [preview, setPreview] = useState<PreviewState | null>(null)
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set())
  const [resultado, setResultado] = useState<PricesRespuesta | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cargando, startTransition] = useTransition()

  const abrirPreview = () => {
    setError(null)
    setResultado(null)
    startTransition(async () => {
      const r = await previewPublicacionPrecios()
      if (r.error || !r.respuesta?.lines || !r.batchReference || !r.lineas) {
        setError(r.error ?? 'El preview no devolvió líneas')
        setPreview(null)
        return
      }
      setPreview({
        batchReference: r.batchReference,
        lineas: r.lineas,
        detalle: r.respuesta.lines,
        sinMapear: r.sinMapear ?? [],
        excluidas: r.excluidas ?? [],
      })
      // por defecto van tildadas solo las que cambian precio
      setSeleccion(new Set(
        r.respuesta.lines.filter(l => l.status === 'would_update').map(l => l.store_product_id as string),
      ))
    })
  }

  const publicar = () => {
    if (!preview) return
    setError(null)
    startTransition(async () => {
      const elegidas = preview.lineas.filter(l => seleccion.has(l.store_product_id))
      const r = await aplicarPublicacionPrecios(preview.batchReference, elegidas)
      if (r.error) {
        setError(r.error)
        return
      }
      setResultado(r.respuesta ?? null)
      setPreview(null)
      router.refresh()
    })
  }

  const cerrar = () => { setPreview(null); setResultado(null); setError(null) }
  const toggle = (id: string) => {
    const s = new Set(seleccion)
    if (s.has(id)) s.delete(id); else s.add(id)
    setSeleccion(s)
  }

  return (
    <>
      <button
        onClick={abrirPreview}
        disabled={cargando}
        className="px-4 py-1.5 rounded-full text-sm font-medium bg-gray-900 text-white border border-gray-900 hover:bg-gray-700 disabled:opacity-50"
      >
        {cargando && !preview ? 'Consultando tienda…' : 'Publicar precios en tienda'}
      </button>

      {error && !preview && (
        <span className="text-xs text-red-600 ml-2">{error}</span>
      )}

      {resultado && (
        <span className="text-xs text-green-700 ml-2 font-medium">
          ✓ Publicado: {resultado.summary?.updated ?? 0} actualizados, {resultado.summary?.unchanged ?? 0} sin cambio
        </span>
      )}

      {preview && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={cerrar}>
          <div className="bg-white rounded-2xl shadow-xl max-w-3xl w-full max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-bold text-gray-900">Publicar precios en la tienda</h2>
              <p className="text-xs text-gray-500">
                Diff validado por GOcelular ({preview.batchReference}). Destildá lo que no quieras tocar — todo o nada: si una línea falla, no se aplica ninguna.
              </p>
            </div>

            <div className="overflow-y-auto px-6 py-3 flex-1">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-500 border-b border-gray-200">
                    <th className="py-2"></th>
                    <th className="text-left py-2">Modelo</th>
                    <th className="text-right py-2">Tienda hoy</th>
                    <th className="text-right py-2">Nuevo</th>
                    <th className="text-right py-2">Δ%</th>
                    <th className="text-left py-2 pl-3">Avisos</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {preview.detalle.map(l => {
                    const id = l.store_product_id as string
                    const cambia = l.status === 'would_update'
                    return (
                      <tr key={id} className={cambia ? '' : 'text-gray-400'}>
                        <td className="py-1.5 pr-2">
                          <input type="checkbox" checked={seleccion.has(id)} onChange={() => toggle(id)} disabled={!cambia && !seleccion.has(id)} />
                        </td>
                        <td className="py-1.5">{l.display_name}</td>
                        <td className="py-1.5 text-right tabular-nums">{peso(l.current_price)}</td>
                        <td className={`py-1.5 text-right tabular-nums ${cambia ? 'font-semibold text-gray-900' : ''}`}>{peso(l.new_price)}</td>
                        <td className={`py-1.5 text-right tabular-nums ${(l.delta_pct ?? 0) < 0 ? 'text-red-600' : (l.delta_pct ?? 0) > 0 ? 'text-green-700' : ''}`}>
                          {cambia ? `${(l.delta_pct ?? 0) > 0 ? '+' : ''}${l.delta_pct}%` : 'sin cambio'}
                        </td>
                        <td className="py-1.5 pl-3 text-xs text-amber-700">
                          {(l.warnings ?? []).map(w => WARNING_LABEL[w] ?? w).join(', ')}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>

              {(preview.sinMapear.length > 0 || preview.excluidas.length > 0) && (
                <p className="text-xs text-gray-400 mt-3">
                  {preview.sinMapear.length > 0 && <>Sin producto en la tienda (no se publican): {preview.sinMapear.join(', ')}. </>}
                  {preview.excluidas.length > 0 && <>Sin PVP calculable: {preview.excluidas.join(', ')}.</>}
                </p>
              )}
              {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
            </div>

            <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-end gap-3">
              <button onClick={cerrar} className="px-4 py-1.5 rounded-full text-sm text-gray-600 border border-gray-300 hover:border-gray-400">Cancelar</button>
              <button
                onClick={publicar}
                disabled={cargando || seleccion.size === 0}
                className="px-4 py-1.5 rounded-full text-sm font-medium bg-violet-700 text-white hover:bg-violet-800 disabled:opacity-50"
              >
                {cargando ? 'Publicando…' : `Publicar ${seleccion.size} ${seleccion.size === 1 ? 'cambio' : 'cambios'}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
