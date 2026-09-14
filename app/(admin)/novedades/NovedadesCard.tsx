'use client'

import { useState, useTransition } from 'react'
import { marcarNovedadesLeidas, type Novedad } from '@/lib/actions/novedades'

const TIPO_COLOR: Record<string, string> = {
  schema: 'bg-purple-100 text-purple-700',
  feature: 'bg-emerald-100 text-emerald-700',
  aviso: 'bg-amber-100 text-amber-700',
}

function fechaCorta(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export default function NovedadesCard({ novedades }: { novedades: Novedad[] }) {
  const [items, setItems] = useState(novedades)
  const [pending, startTransition] = useTransition()
  const noLeidas = items.filter(n => !n.leida_at)

  function marcarTodas() {
    const ids = noLeidas.map(n => n.id)
    startTransition(async () => {
      const { ok } = await marcarNovedadesLeidas(ids)
      if (ok) {
        const ahora = new Date().toISOString()
        setItems(prev => prev.map(n => (n.leida_at ? n : { ...n, leida_at: ahora })))
      }
    })
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 md:p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {noLeidas.length > 0 ? (
            <span className="bg-indigo-600 text-white text-sm font-bold rounded-full px-2.5 py-0.5">{noLeidas.length} sin leer</span>
          ) : (
            <span className="text-sm text-gray-400">Todo leído</span>
          )}
        </div>
        {noLeidas.length > 0 && (
          <button
            onClick={marcarTodas}
            disabled={pending}
            className="text-sm font-medium text-gray-500 hover:text-gray-900 disabled:opacity-50"
          >
            {pending ? 'Marcando…' : 'Marcar leídas'}
          </button>
        )}
      </div>
      {items.length === 0 ? (
        <p className="text-base text-gray-400">Sin novedades. Los cambios que informe el sistema de GOcelular van a aparecer acá.</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {items.map(n => (
            <li key={n.id} className={`py-3 md:py-4 ${n.leida_at ? 'opacity-50' : ''}`}>
              <div className="flex items-start gap-3">
                {!n.leida_at && <span className="mt-2.5 w-2 h-2 rounded-full bg-indigo-600 shrink-0" />}
                <div className="min-w-0 flex-1">
                  <p className="text-base md:text-lg font-medium text-gray-900">
                    {n.tipo && (
                      <span className={`inline-block text-xs font-semibold rounded px-2 py-0.5 mr-2 align-middle ${TIPO_COLOR[n.tipo] ?? 'bg-gray-100 text-gray-600'}`}>
                        {n.tipo}
                      </span>
                    )}
                    {n.titulo}
                  </p>
                  {n.detalle && <p className="text-sm md:text-base text-gray-600 mt-1 whitespace-pre-wrap">{n.detalle}</p>}
                  <p className="text-xs md:text-sm text-gray-400 mt-1.5">
                    {fechaCorta(n.created_at)}
                    {n.referencia && <> · {n.referencia}</>}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
