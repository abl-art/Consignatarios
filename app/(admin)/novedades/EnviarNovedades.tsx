'use client'

import { useState, useTransition } from 'react'
import { enviarNovedadGocelular, reintentarNovedadGocelular, type NovedadEnviada } from '@/lib/actions/novedades'
import { TIPOS_NOVEDAD } from '@/lib/novedades-salientes'

const COLOR_TIPO: Record<string, string> = {
  schema: 'bg-violet-100 text-violet-700',
  feature: 'bg-emerald-100 text-emerald-700',
  aviso: 'bg-amber-100 text-amber-700',
}

export default function EnviarNovedades({ enviadas }: { enviadas: NovedadEnviada[] }) {
  const [titulo, setTitulo] = useState('')
  const [detalle, setDetalle] = useState('')
  const [tipo, setTipo] = useState('aviso')
  const [referencia, setReferencia] = useState('')
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null)
  const [pendiente, startTransition] = useTransition()

  const enviar = () => {
    setMensaje(null)
    startTransition(async () => {
      const r = await enviarNovedadGocelular({ titulo, detalle, tipo, referencia })
      if (r.ok) {
        setMensaje({ ok: true, texto: 'Novedad enviada a GOcelular' })
        setTitulo(''); setDetalle(''); setReferencia('')
      } else {
        setMensaje({ ok: false, texto: `Quedó guardada como fallida — ${r.error}` })
        setTitulo(''); setDetalle(''); setReferencia('')
      }
    })
  }

  const reintentar = (id: string) => {
    setMensaje(null)
    startTransition(async () => {
      const r = await reintentarNovedadGocelular(id)
      setMensaje(r.ok ? { ok: true, texto: 'Novedad reenviada' } : { ok: false, texto: `Sigue fallando — ${r.error}` })
    })
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">Informar novedad a GOcelular</h2>
        <div className="space-y-3 max-w-2xl">
          <div className="flex gap-3">
            <input
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Título (obligatorio)"
              maxLength={300}
              className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2"
            />
            <select value={tipo} onChange={(e) => setTipo(e.target.value)} className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white">
              {TIPOS_NOVEDAD.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <textarea
            value={detalle}
            onChange={(e) => setDetalle(e.target.value)}
            placeholder="Detalle (opcional)"
            maxLength={2000}
            rows={3}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2"
          />
          <div className="flex gap-3 items-center">
            <input
              value={referencia}
              onChange={(e) => setReferencia(e.target.value)}
              placeholder="Referencia (opcional: pedido, IMEI, request_id...)"
              maxLength={200}
              className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2"
            />
            <button
              onClick={enviar}
              disabled={pendiente || titulo.trim() === ''}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-gray-900 text-white hover:bg-gray-700 disabled:opacity-40"
            >
              {pendiente ? 'Enviando…' : 'Enviar'}
            </button>
          </div>
          {mensaje && (
            <p className={`text-xs ${mensaje.ok ? 'text-emerald-600' : 'text-amber-700'}`}>{mensaje.texto}</p>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <h2 className="px-4 pt-4 text-sm font-semibold text-gray-900">Enviadas</h2>
        {enviadas.length === 0 ? (
          <p className="px-4 py-6 text-sm text-gray-500">Todavía no se envió ninguna novedad.</p>
        ) : (
          <table className="w-full text-sm mt-2">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs text-gray-500">
                <th className="px-4 py-2.5 font-medium">Fecha</th>
                <th className="px-3 py-2.5 font-medium">Tipo</th>
                <th className="px-3 py-2.5 font-medium">Título</th>
                <th className="px-3 py-2.5 font-medium">Referencia</th>
                <th className="px-3 py-2.5 font-medium">Estado</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {enviadas.map((n) => (
                <tr key={n.id} className="border-b border-gray-50 align-top">
                  <td className="px-4 py-2 text-gray-500 whitespace-nowrap">{new Date(n.created_at).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                  <td className="px-3 py-2">
                    {n.tipo && (
                      <span className={`inline-block px-2 py-0.5 text-[10px] font-semibold rounded-full ${COLOR_TIPO[n.tipo] ?? 'bg-gray-100 text-gray-600'}`}>{n.tipo}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-gray-900">
                    <span className="font-medium">{n.titulo}</span>
                    {n.detalle && <p className="text-xs text-gray-500 mt-0.5 whitespace-pre-wrap">{n.detalle}</p>}
                  </td>
                  <td className="px-3 py-2 text-gray-500 text-xs">{n.referencia ?? '—'}</td>
                  <td className="px-3 py-2">
                    <span className={`inline-block px-2 py-0.5 text-[10px] font-semibold rounded-full ${n.estado === 'enviada' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                      {n.estado}
                    </span>
                    {n.respuesta && <p className="text-[10px] text-gray-400 mt-0.5 max-w-[200px]">{n.respuesta}</p>}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {n.estado === 'fallida' && (
                      <button
                        onClick={() => reintentar(n.id)}
                        disabled={pendiente}
                        className="px-3 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-40"
                      >
                        Reintentar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="px-4 py-3 text-xs text-gray-400">
          Se envían firmadas con el secret compartido al endpoint de GOcelular (flujo_config: gocelular_novedades_url). Las
          fallidas quedan guardadas y se reintentan con un click cuando Pedro tenga el receptor listo.
        </p>
      </div>
    </div>
  )
}
