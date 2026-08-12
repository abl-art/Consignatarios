'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  listarMails,
  leerMail,
  eliminarMail,
  ocultarMailApp,
  pasarAPendiente,
  type MailResumen,
  type MailDetalle,
  type VistaMails,
} from '@/lib/actions/gmail'

const VISTAS: { id: VistaMails; label: string; desc: string }[] = [
  { id: 'inbox', label: 'Bandeja', desc: 'Bandeja de entrada de Gmail' },
  { id: 'pedidos', label: 'Pedidos', desc: 'Pedidos enviados a proveedores desde el gestor' },
  { id: 'cristian', label: 'Cristian', desc: 'Mails de cristian@gocuotas.com o donde está copiado' },
]

function fmtFecha(rfc: string): string {
  const d = new Date(rfc)
  if (isNaN(d.getTime())) return ''
  const hoy = new Date()
  const esHoy = d.toDateString() === hoy.toDateString()
  if (esHoy) return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
}

function ordenar(mails: MailResumen[]): MailResumen[] {
  return [...mails].sort((a, b) => {
    if (a.noLeido !== b.noLeido) return a.noLeido ? -1 : 1
    return new Date(b.fecha).getTime() - new Date(a.fecha).getTime()
  })
}

export default function MailsTab({ active }: { active: boolean }) {
  const [vista, setVista] = useState<VistaMails>('inbox')
  const [busqueda, setBusqueda] = useState('')
  const [busquedaActiva, setBusquedaActiva] = useState('')
  const [mails, setMails] = useState<MailResumen[]>([])
  const [nextToken, setNextToken] = useState<string | undefined>()
  const [loading, setLoading] = useState(false)
  const [cargado, setCargado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [detalle, setDetalle] = useState<MailDetalle | null>(null)
  const [detalleLoading, setDetalleLoading] = useState(false)
  const [accionando, setAccionando] = useState<Set<string>>(new Set())
  const [avisoPendiente, setAvisoPendiente] = useState<string | null>(null)

  const cargar = useCallback(
    async (opts?: { vista?: VistaMails; busqueda?: string; pageToken?: string; append?: boolean }) => {
      const v = opts?.vista ?? vista
      const b = opts?.busqueda ?? busquedaActiva
      setLoading(true)
      setError(null)
      try {
        const res = await listarMails({ vista: v, busqueda: b || undefined, pageToken: opts?.pageToken })
        if (res.error) {
          setError(res.error)
          return
        }
        setMails(prev => ordenar(opts?.append ? [...prev, ...(res.mails ?? [])] : res.mails ?? []))
        setNextToken(res.nextPageToken)
        setCargado(true)
      } finally {
        setLoading(false)
      }
    },
    [vista, busquedaActiva]
  )

  useEffect(() => {
    if (active && !cargado && !loading) cargar()
  }, [active, cargado, loading, cargar])

  function cambiarVista(v: VistaMails) {
    setVista(v)
    setMails([])
    setNextToken(undefined)
    cargar({ vista: v })
  }

  function buscar() {
    setBusquedaActiva(busqueda)
    setMails([])
    setNextToken(undefined)
    cargar({ busqueda })
  }

  function limpiarBusqueda() {
    setBusqueda('')
    setBusquedaActiva('')
    setMails([])
    cargar({ busqueda: '' })
  }

  async function abrir(m: MailResumen) {
    setDetalleLoading(true)
    setDetalle(null)
    try {
      const res = await leerMail(m.id)
      if (res.error) {
        setError(res.error)
        return
      }
      setDetalle(res.mail ?? null)
      setMails(prev => prev.map(x => (x.id === m.id ? { ...x, noLeido: false } : x)))
    } finally {
      setDetalleLoading(false)
    }
  }

  async function accion(id: string, fn: (id: string) => Promise<{ ok?: boolean; error?: string }>) {
    setAccionando(prev => new Set(prev).add(id))
    try {
      const res = await fn(id)
      if (res.error) {
        setError(res.error)
        return
      }
      setMails(prev => prev.filter(m => m.id !== id))
      if (detalle?.id === id) setDetalle(null)
    } finally {
      setAccionando(prev => {
        const s = new Set(prev)
        s.delete(id)
        return s
      })
    }
  }

  async function aPendiente(m: MailResumen | MailDetalle) {
    const texto = `📧 ${m.remitente}: ${m.asunto}`
    const res = await pasarAPendiente(texto)
    if (res.error) {
      setError(res.error)
      return
    }
    setAvisoPendiente(m.asunto)
    setTimeout(() => setAvisoPendiente(null), 2500)
  }

  const vistaActual = VISTAS.find(v => v.id === vista)!

  return (
    <div className="flex gap-4 items-start">
      {/* Sidebar */}
      <div className="w-36 shrink-0 space-y-1">
        {VISTAS.map(v => (
          <button
            key={v.id}
            onClick={() => cambiarVista(v.id)}
            title={v.desc}
            className={`w-full text-left px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
              vista === v.id ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>

      {/* Contenido */}
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <div className="flex items-center gap-1 flex-1 min-w-[220px]">
            <input
              type="text"
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && buscar()}
              placeholder={`Buscar en ${vista === 'inbox' ? 'toda la bandeja de entrada' : vistaActual.label.toLowerCase()}...`}
              className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
            />
            <button
              onClick={buscar}
              disabled={loading}
              className="px-3 py-1.5 text-xs font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50"
            >
              Buscar
            </button>
            {busquedaActiva && (
              <button onClick={limpiarBusqueda} className="px-2 py-1.5 text-xs text-gray-500 hover:text-gray-700">
                Limpiar
              </button>
            )}
          </div>
          <button
            onClick={() => cargar()}
            disabled={loading}
            className="px-3 py-1.5 text-xs font-medium bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            {loading ? 'Cargando...' : 'Actualizar'}
          </button>
        </div>

        <p className="text-xs text-gray-400 mb-3">
          {vistaActual.desc}
          {vista === 'inbox' && ' — no leídos primero. Ocultar solo lo saca de acá (en Gmail queda igual); Eliminar manda a la papelera de Gmail.'}
        </p>

        {avisoPendiente && (
          <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2 mb-3">
            Agregado a pendientes de hoy: {avisoPendiente}
          </p>
        )}

        {error && (
          <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">{error}</p>
        )}

        {!cargado && loading && (
          <p className="text-sm text-gray-400 py-10 text-center">Cargando mails...</p>
        )}

        {cargado && mails.length === 0 && !loading && (
          <p className="text-sm text-gray-400 py-10 text-center">
            {busquedaActiva ? 'Sin resultados para la búsqueda' : 'No hay mails acá 🎉'}
          </p>
        )}

        {mails.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden divide-y divide-gray-100">
            {mails.map(m => (
              <div
                key={m.id}
                className={`flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 cursor-pointer group ${
                  m.noLeido ? 'bg-blue-50/40' : ''
                }`}
                onClick={() => abrir(m)}
              >
                <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${m.noLeido ? 'bg-blue-500' : 'bg-transparent'}`} />
                <div className="w-44 shrink-0 truncate">
                  <span className={`text-sm ${m.noLeido ? 'font-semibold text-gray-900' : 'text-gray-600'}`}>
                    {vista === 'pedidos' ? `Para: ${m.para}` : m.remitente}
                  </span>
                </div>
                <div className="flex-1 min-w-0 truncate">
                  <span className={`text-sm ${m.noLeido ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>
                    {m.asunto}
                  </span>
                  <span className="text-xs text-gray-400 ml-2">{m.snippet.slice(0, 80)}</span>
                </div>
                <span className="text-xs text-gray-400 shrink-0 w-14 text-right">{fmtFecha(m.fecha)}</span>
                <div
                  className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={e => e.stopPropagation()}
                >
                  <button
                    title="Pasar a pendientes"
                    onClick={() => aPendiente(m)}
                    className="px-2 py-1 text-xs bg-amber-100 text-amber-700 rounded hover:bg-amber-200"
                  >
                    Pendiente
                  </button>
                  <button
                    title="Ocultar de esta sección (en Gmail queda igual)"
                    onClick={() => accion(m.id, ocultarMailApp)}
                    disabled={accionando.has(m.id)}
                    className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded hover:bg-gray-200 disabled:opacity-50"
                  >
                    Ocultar
                  </button>
                  <button
                    title="Eliminar (a papelera de Gmail)"
                    onClick={() => accion(m.id, eliminarMail)}
                    disabled={accionando.has(m.id)}
                    className="px-2 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200 disabled:opacity-50"
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {nextToken && (
          <div className="text-center mt-4">
            <button
              onClick={() => cargar({ pageToken: nextToken, append: true })}
              disabled={loading}
              className="px-4 py-2 text-xs font-medium bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              {loading ? 'Cargando...' : 'Cargar más'}
            </button>
          </div>
        )}
      </div>

      {/* Detalle del mail */}
      {(detalle || detalleLoading) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setDetalle(null)}>
          <div
            className="bg-white rounded-xl border border-gray-200 shadow-xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {detalleLoading ? (
              <p className="text-sm text-gray-400 py-16 text-center">Cargando mail...</p>
            ) : detalle && (
              <>
                <div className="px-5 py-4 border-b border-gray-200 flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h3 className="font-semibold text-gray-900 truncate">{detalle.asunto}</h3>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {detalle.remitente} &lt;{detalle.remitenteEmail}&gt; · {fmtFecha(detalle.fecha)}
                    </p>
                  </div>
                  <button
                    onClick={() => setDetalle(null)}
                    className="text-gray-400 hover:text-gray-600 text-lg leading-none shrink-0"
                  >
                    ×
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto">
                  {detalle.html ? (
                    <iframe sandbox="" srcDoc={detalle.html} className="w-full h-[55vh] border-0" title="Contenido del mail" />
                  ) : (
                    <pre className="text-sm text-gray-800 whitespace-pre-wrap p-5 font-sans">
                      {detalle.texto || '(sin contenido)'}
                    </pre>
                  )}
                </div>
                <div className="px-5 py-3 border-t border-gray-200 flex gap-2 justify-end">
                  <button
                    onClick={() => aPendiente(detalle)}
                    className="px-3 py-1.5 text-xs bg-amber-100 text-amber-700 rounded-lg hover:bg-amber-200"
                  >
                    Pasar a pendientes
                  </button>
                  <button
                    onClick={() => accion(detalle.id, ocultarMailApp)}
                    className="px-3 py-1.5 text-xs bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200"
                  >
                    Ocultar
                  </button>
                  <button
                    onClick={() => accion(detalle.id, eliminarMail)}
                    className="px-3 py-1.5 text-xs bg-red-100 text-red-700 rounded-lg hover:bg-red-200"
                  >
                    Eliminar
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
