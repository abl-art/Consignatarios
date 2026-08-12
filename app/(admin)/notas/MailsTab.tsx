'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  listarMails,
  leerMail,
  eliminarMail,
  ocultarMailApp,
  pasarAPendiente,
  archivarSpsAutomatico,
  descargarAdjunto,
  marcarImportante,
  marcarNoLeido,
  enviarMailNuevo,
  responderMail,
  getContactos,
  type MailResumen,
  type MailDetalle,
  type VistaMails,
  type AdjuntoInfo,
  type AdjuntoNuevo,
  type Contacto,
} from '@/lib/actions/gmail'

const VISTAS: { id: VistaMails; label: string; desc: string }[] = [
  { id: 'inbox', label: 'Bandeja', desc: 'Mails sin leer — al leerlos desaparecen (el buscador rastrea toda la bandeja)' },
  { id: 'importantes', label: 'Importantes', desc: 'Mails marcados con ★ (para trackear después)' },
  { id: 'basecamp', label: 'Basecamp', desc: 'Asignaciones, menciones y conversaciones de Basecamp' },
  { id: 'cristian', label: 'Cristian', desc: 'Mails donde el remitente es cristian@gocuotas.com' },
  { id: 'soporte', label: 'Soporte GOcelular', desc: 'Mails de gocuotasprod@cloud.trustonic.com (incluye borrados)' },
  { id: 'pedidos', label: 'Pedidos', desc: 'Pedidos enviados a proveedores desde el gestor' },
  { id: 'enviados', label: 'Enviados', desc: 'Todos los mails enviados' },
]

const VISTAS_ENVIADOS: VistaMails[] = ['pedidos', 'enviados']
const MAX_ADJUNTOS_MB = 3
const COLORES = ['#111827', '#dc2626', '#2563eb', '#16a34a', '#E91E7B']

type ComposeModo =
  | { tipo: 'nuevo' }
  | { tipo: 'responder'; mail: MailDetalle; todos: boolean }

function fmtFecha(rfc: string): string {
  const d = new Date(rfc)
  if (isNaN(d.getTime())) return ''
  const hoy = new Date()
  if (d.toDateString() === hoy.toDateString()) {
    return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
  }
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
}

function fmtBytes(b: number): string {
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${Math.round(b / 1024)} KB`
  return `${(b / (1024 * 1024)).toFixed(1)} MB`
}

function ordenar(mails: MailResumen[]): MailResumen[] {
  return [...mails].sort((a, b) => {
    if (a.noLeido !== b.noLeido) return a.noLeido ? -1 : 1
    return new Date(b.fecha).getTime() - new Date(a.fecha).getTime()
  })
}

function extraerEmails(raw: string): string[] {
  return raw
    .split(',')
    .map(p => {
      const m = p.match(/<([^>]+)>/)
      return (m ? m[1] : p).trim().toLowerCase()
    })
    .filter(e => e.includes('@'))
}

export default function MailsTab({ active }: { active: boolean }) {
  const [vista, setVista] = useState<VistaMails>('inbox')
  const [busqueda, setBusqueda] = useState('')
  const [mails, setMails] = useState<MailResumen[]>([])
  const [nextToken, setNextToken] = useState<string | undefined>()
  const [loading, setLoading] = useState(false)
  const [cargado, setCargado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [detalle, setDetalle] = useState<MailDetalle | null>(null)
  const [detalleLoading, setDetalleLoading] = useState(false)
  const [detalleNoLeido, setDetalleNoLeido] = useState(false)
  const [accionando, setAccionando] = useState<Set<string>>(new Set())
  const [aviso, setAviso] = useState<string | null>(null)
  const [descargando, setDescargando] = useState<string | null>(null)
  const [importantes, setImportantes] = useState<Set<string>>(new Set())
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const requestSeq = useRef(0)
  const spsListo = useRef(false)

  // Nuevo correo / responder
  const [compose, setCompose] = useState<ComposeModo | null>(null)
  const [composePara, setComposePara] = useState('')
  const [composeCc, setComposeCc] = useState('')
  const [composeAsunto, setComposeAsunto] = useState('')
  const [composeAdjuntos, setComposeAdjuntos] = useState<AdjuntoNuevo[]>([])
  const [composeEnviando, setComposeEnviando] = useState(false)
  const [composeError, setComposeError] = useState<string | null>(null)
  const [contactos, setContactos] = useState<Contacto[]>([])
  const [miEmail, setMiEmail] = useState('')
  const [sugerencias, setSugerencias] = useState<Contacto[]>([])
  const editorRef = useRef<HTMLDivElement>(null)
  const contactosPedidos = useRef(false)

  const mostrarAviso = (texto: string) => {
    setAviso(texto)
    setTimeout(() => setAviso(null), 2500)
  }

  const cargar = useCallback(
    async (opts: { vista: VistaMails; busqueda: string; pageToken?: string; append?: boolean }) => {
      const seq = ++requestSeq.current
      setLoading(true)
      setError(null)
      try {
        const res = await listarMails({
          vista: opts.vista,
          busqueda: opts.busqueda || undefined,
          pageToken: opts.pageToken,
        })
        if (seq !== requestSeq.current) return
        if (res.error) {
          setError(res.error)
          return
        }
        setMails(prev => ordenar(opts.append ? [...prev, ...(res.mails ?? [])] : res.mails ?? []))
        setNextToken(res.nextPageToken)
        setCargado(true)
      } finally {
        if (seq === requestSeq.current) setLoading(false)
      }
    },
    []
  )

  useEffect(() => {
    if (active && !cargado && !loading) {
      if (!spsListo.current) {
        spsListo.current = true
        archivarSpsAutomatico().catch(() => {})
      }
      cargar({ vista, busqueda })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])

  // Busqueda mientras se escribe (debounce 450ms)
  useEffect(() => {
    if (!cargado) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setMails([])
      setNextToken(undefined)
      cargar({ vista, busqueda })
    }, 450)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busqueda])

  function cambiarVista(v: VistaMails) {
    setVista(v)
    setMails([])
    setNextToken(undefined)
    cargar({ vista: v, busqueda })
  }

  async function abrir(m: MailResumen) {
    setDetalleLoading(true)
    setDetalle(null)
    setDetalleNoLeido(false)
    try {
      const res = await leerMail(m.id)
      if (res.error) {
        setError(res.error)
        return
      }
      setDetalle(res.mail ?? null)
    } finally {
      setDetalleLoading(false)
    }
  }

  // Al cerrar un mail leido en la Bandeja (sin busqueda), desaparece
  function cerrarDetalle() {
    if (detalle && vista === 'inbox' && !busqueda && !detalleNoLeido) {
      setMails(prev => prev.filter(m => m.id !== detalle.id))
    } else if (detalle) {
      setMails(prev => ordenar(prev.map(m => (m.id === detalle.id ? { ...m, noLeido: detalleNoLeido } : m))))
    }
    setDetalle(null)
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
    if (res.error) setError(res.error)
    else mostrarAviso(`Agregado a pendientes: ${m.asunto}`)
  }

  async function aImportante(id: string) {
    const res = await marcarImportante(id)
    if (res.error) {
      setError(res.error)
      return
    }
    setImportantes(prev => new Set(prev).add(id))
    mostrarAviso('Marcado como importante — lo encontrás en la pestaña Importantes')
  }

  async function aNoLeido(id: string) {
    const res = await marcarNoLeido(id)
    if (res.error) {
      setError(res.error)
      return
    }
    if (detalle?.id === id) setDetalleNoLeido(true)
    setMails(prev => ordenar(prev.map(m => (m.id === id ? { ...m, noLeido: true } : m))))
    mostrarAviso('Marcado como no leído — vuelve a la Bandeja')
  }

  async function bajarAdjunto(mensajeId: string, adj: AdjuntoInfo) {
    setDescargando(adj.attachmentId)
    try {
      const res = await descargarAdjunto(mensajeId, adj.attachmentId)
      if (res.error || !res.base64) {
        setError(res.error ?? 'No se pudo descargar el adjunto')
        return
      }
      const byteChars = atob(res.base64)
      const bytes = new Uint8Array(byteChars.length)
      for (let i = 0; i < byteChars.length; i++) bytes[i] = byteChars.charCodeAt(i)
      const blob = new Blob([bytes], { type: adj.mimeType })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = adj.filename
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setDescargando(null)
    }
  }

  // ── Compose ──────────────────────────────────────────────────────────────

  function cargarContactos() {
    if (contactosPedidos.current) return
    contactosPedidos.current = true
    getContactos()
      .then(res => {
        setContactos(res.contactos)
        setMiEmail(res.miEmail)
      })
      .catch(() => {})
  }

  function abrirComposeNuevo() {
    cargarContactos()
    setCompose({ tipo: 'nuevo' })
    setComposePara('')
    setComposeCc('')
    setComposeAsunto('')
    setComposeAdjuntos([])
    setComposeError(null)
  }

  function abrirResponder(mail: MailDetalle, todos: boolean) {
    cargarContactos()
    const propios = new Set([miEmail.toLowerCase()])
    let para = mail.remitenteEmail
    let cc = ''
    if (todos) {
      const otros = [...extraerEmails(mail.para), ...([] as string[])].filter(
        e => !propios.has(e) && e !== mail.remitenteEmail.toLowerCase()
      )
      para = [mail.remitenteEmail, ...otros].join(', ')
      cc = extraerEmails(mail.cc)
        .filter(e => !propios.has(e))
        .join(', ')
    }
    setCompose({ tipo: 'responder', mail, todos })
    setComposePara(para)
    setComposeCc(cc)
    setComposeAsunto(mail.asunto.toLowerCase().startsWith('re:') ? mail.asunto : `Re: ${mail.asunto}`)
    setComposeAdjuntos([])
    setComposeError(null)
  }

  function cerrarCompose() {
    setCompose(null)
    setSugerencias([])
  }

  // Autocompletado: filtra contactos por el ultimo destinatario que se escribe
  function actualizarPara(valor: string) {
    setComposePara(valor)
    const ultimo = valor.split(',').pop()?.trim().toLowerCase() ?? ''
    if (ultimo.length < 2) {
      setSugerencias([])
      return
    }
    setSugerencias(
      contactos
        .filter(c => c.email.includes(ultimo) || c.nombre.toLowerCase().includes(ultimo))
        .slice(0, 6)
    )
  }

  function elegirSugerencia(c: Contacto) {
    const partes = composePara.split(',')
    partes[partes.length - 1] = ` ${c.email}`
    setComposePara(partes.join(',').replace(/^\s+/, '') + ', ')
    setSugerencias([])
  }

  function formato(cmd: string, valor?: string) {
    editorRef.current?.focus()
    document.execCommand(cmd, false, valor)
  }

  async function agregarAdjuntosCompose(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    setComposeError(null)
    const nuevos: AdjuntoNuevo[] = []
    let totalBytes = composeAdjuntos.reduce((s, a) => s + a.base64.length * 0.75, 0)
    for (const f of files) {
      totalBytes += f.size
      if (totalBytes > MAX_ADJUNTOS_MB * 1024 * 1024) {
        setComposeError(`Los adjuntos superan el límite de ${MAX_ADJUNTOS_MB} MB en total`)
        break
      }
      const buf = await f.arrayBuffer()
      let b64 = ''
      const bytes = new Uint8Array(buf)
      for (let i = 0; i < bytes.length; i += 0x8000) {
        b64 += String.fromCharCode(...Array.from(bytes.subarray(i, i + 0x8000)))
      }
      nuevos.push({ filename: f.name, mimeType: f.type || 'application/octet-stream', base64: btoa(b64) })
    }
    setComposeAdjuntos(prev => [...prev, ...nuevos])
    e.target.value = ''
  }

  async function enviarCompose() {
    const cuerpo = editorRef.current?.innerHTML ?? ''
    if (!composePara.includes('@') || !composeAsunto.trim()) {
      setComposeError('Completá destinatario y asunto')
      return
    }
    setComposeEnviando(true)
    setComposeError(null)
    try {
      const res =
        compose?.tipo === 'responder'
          ? await responderMail({
              threadId: compose.mail.threadId,
              messageIdHeader: compose.mail.messageIdHeader,
              para: composePara.trim().replace(/,\s*$/, ''),
              cc: composeCc.trim().replace(/,\s*$/, '') || undefined,
              asunto: composeAsunto.trim(),
              cuerpo,
              adjuntos: composeAdjuntos,
            })
          : await enviarMailNuevo({
              para: composePara.trim().replace(/,\s*$/, ''),
              asunto: composeAsunto.trim(),
              cuerpo,
              adjuntos: composeAdjuntos,
            })
      if (res.error) {
        setComposeError(res.error)
        return
      }
      cerrarCompose()
      mostrarAviso(compose?.tipo === 'responder' ? 'Respuesta enviada' : 'Correo enviado')
    } finally {
      setComposeEnviando(false)
    }
  }

  const vistaActual = VISTAS.find(v => v.id === vista)!
  const esEnviados = VISTAS_ENVIADOS.includes(vista)

  return (
    <div className="flex gap-5 items-start">
      {/* Sidebar estilo finanzas */}
      <div className="w-44 shrink-0 border-r border-gray-200 pr-2">
        <button
          onClick={abrirComposeNuevo}
          className="w-full mb-3 px-3 py-2 text-sm font-semibold bg-magenta-600 text-white rounded-lg hover:bg-magenta-700 transition-colors"
        >
          + Nuevo correo
        </button>
        {VISTAS.map(v => (
          <button
            key={v.id}
            onClick={() => cambiarVista(v.id)}
            title={v.desc}
            className={`w-full text-left px-3 py-2 text-sm font-medium border-l-2 transition-colors ${
              vista === v.id
                ? 'border-magenta-600 text-magenta-600 bg-magenta-50/50'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            {v.id === 'importantes' ? '★ Importantes' : v.label}
          </button>
        ))}
      </div>

      {/* Contenido */}
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <input
            type="text"
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            placeholder={vista === 'inbox' ? 'Buscar en toda la bandeja de entrada...' : `Buscar en ${vistaActual.label.toLowerCase()}...`}
            className="flex-1 min-w-[220px] px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-magenta-400"
          />
          {busqueda && (
            <button onClick={() => setBusqueda('')} className="px-2 py-1.5 text-xs text-gray-500 hover:text-gray-700">
              Limpiar
            </button>
          )}
          <button
            onClick={() => cargar({ vista, busqueda })}
            disabled={loading}
            className="px-4 py-2 text-xs font-semibold bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Cargando...' : 'Actualizar'}
          </button>
        </div>

        <p className="text-xs text-gray-400 mb-3">{vistaActual.desc}</p>

        {aviso && (
          <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2 mb-3">{aviso}</p>
        )}

        {error && (
          <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">{error}</p>
        )}

        {!cargado && loading && <p className="text-sm text-gray-400 py-10 text-center">Cargando mails...</p>}

        {cargado && mails.length === 0 && !loading && (
          <p className="text-sm text-gray-400 py-10 text-center">
            {busqueda ? 'Sin resultados para la búsqueda' : vista === 'inbox' ? 'Bandeja vacía, objetivo cumplido 🎉' : 'No hay mails acá'}
          </p>
        )}

        {mails.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden divide-y divide-gray-100">
            {mails.map(m => (
              <div
                key={m.id}
                className={`flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 cursor-pointer ${
                  m.noLeido ? 'bg-magenta-50/30' : ''
                }`}
                onClick={() => abrir(m)}
              >
                <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${m.noLeido ? 'bg-magenta-600' : 'bg-transparent'}`} />
                <div className="w-40 shrink-0 truncate">
                  <span className={`text-sm ${m.noLeido ? 'font-semibold text-gray-900' : 'text-gray-600'}`}>
                    {esEnviados ? `Para: ${m.para}` : m.remitente}
                  </span>
                </div>
                <div className="flex-1 min-w-0 truncate">
                  {(importantes.has(m.id) || vista === 'importantes') && <span className="text-amber-500 mr-1">★</span>}
                  <span className={`text-sm ${m.noLeido ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>
                    {m.asunto}
                  </span>
                  <span className="text-xs text-gray-400 ml-2 hidden md:inline">{m.snippet.slice(0, 60)}</span>
                </div>
                <span className="text-xs text-gray-400 shrink-0 w-12 text-right">{fmtFecha(m.fecha)}</span>
                <div className="flex gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                  <button
                    title="Pasar a pendientes"
                    onClick={() => aPendiente(m)}
                    className="px-2 py-1 text-xs bg-amber-100 text-amber-700 rounded hover:bg-amber-200"
                  >
                    Pendiente
                  </button>
                  <button
                    title="Marcar como importante (pestaña Importantes)"
                    onClick={() => aImportante(m.id)}
                    className="px-2 py-1 text-xs bg-yellow-100 text-yellow-700 rounded hover:bg-yellow-200"
                  >
                    ★
                  </button>
                  {!m.noLeido && (
                    <button
                      title="Marcar como no leído (vuelve a la Bandeja)"
                      onClick={() => aNoLeido(m.id)}
                      className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                    >
                      No leído
                    </button>
                  )}
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
              onClick={() => cargar({ vista, busqueda, pageToken: nextToken, append: true })}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={cerrarDetalle}>
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
                  <button onClick={cerrarDetalle} className="text-gray-400 hover:text-gray-600 text-lg leading-none shrink-0">
                    ×
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto">
                  {detalle.html ? (
                    <iframe sandbox="" srcDoc={detalle.html} className="w-full h-[48vh] border-0" title="Contenido del mail" />
                  ) : (
                    <pre className="text-sm text-gray-800 whitespace-pre-wrap p-5 font-sans">
                      {detalle.texto || '(sin contenido)'}
                    </pre>
                  )}
                </div>
                {detalle.adjuntos.length > 0 && (
                  <div className="px-5 py-3 border-t border-gray-100 flex flex-wrap gap-2">
                    {detalle.adjuntos.map(adj => (
                      <button
                        key={adj.attachmentId}
                        onClick={() => bajarAdjunto(detalle.id, adj)}
                        disabled={descargando === adj.attachmentId}
                        className="inline-flex items-center gap-2 px-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 disabled:opacity-50 text-gray-700"
                      >
                        <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                        </svg>
                        {descargando === adj.attachmentId ? 'Descargando...' : `${adj.filename} (${fmtBytes(adj.sizeBytes)})`}
                      </button>
                    ))}
                  </div>
                )}
                <div className="px-5 py-3 border-t border-gray-200 flex flex-wrap gap-2 justify-end">
                  <button
                    onClick={() => abrirResponder(detalle, false)}
                    className="px-3 py-1.5 text-xs font-semibold bg-magenta-600 text-white rounded-lg hover:bg-magenta-700"
                  >
                    Responder
                  </button>
                  <button
                    onClick={() => abrirResponder(detalle, true)}
                    className="px-3 py-1.5 text-xs font-semibold bg-magenta-100 text-magenta-700 rounded-lg hover:bg-magenta-200"
                  >
                    Responder a todos
                  </button>
                  <button
                    onClick={() => aPendiente(detalle)}
                    className="px-3 py-1.5 text-xs bg-amber-100 text-amber-700 rounded-lg hover:bg-amber-200"
                  >
                    Pendiente
                  </button>
                  <button
                    onClick={() => aImportante(detalle.id)}
                    className="px-3 py-1.5 text-xs bg-yellow-100 text-yellow-700 rounded-lg hover:bg-yellow-200"
                  >
                    ★ Importante
                  </button>
                  <button
                    onClick={() => aNoLeido(detalle.id)}
                    disabled={detalleNoLeido}
                    className="px-3 py-1.5 text-xs bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 disabled:opacity-50"
                  >
                    {detalleNoLeido ? 'Quedó no leído' : 'No leído'}
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

      {/* Nuevo correo / responder */}
      {compose && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl border border-gray-200 shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">
                {compose.tipo === 'nuevo' ? 'Nuevo correo' : compose.todos ? 'Responder a todos' : 'Responder'}
              </h3>
              <button onClick={cerrarCompose} className="text-xs text-gray-500 hover:text-gray-700">Cancelar</button>
            </div>
            <div className="p-5 space-y-3 overflow-y-auto">
              <div className="relative">
                <input
                  type="text"
                  value={composePara}
                  onChange={e => actualizarPara(e.target.value)}
                  placeholder="Para (escribí un nombre o email; varios separados por coma)"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-magenta-400"
                />
                {sugerencias.length > 0 && (
                  <div className="absolute z-10 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
                    {sugerencias.map(c => (
                      <button
                        key={c.email}
                        onClick={() => elegirSugerencia(c)}
                        className="w-full text-left px-3 py-2 hover:bg-magenta-50 text-sm"
                      >
                        <span className="font-medium text-gray-900">{c.nombre}</span>
                        {c.nombre !== c.email && <span className="text-xs text-gray-500 ml-2">{c.email}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {compose.tipo === 'responder' && compose.todos && (
                <input
                  type="text"
                  value={composeCc}
                  onChange={e => setComposeCc(e.target.value)}
                  placeholder="CC"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-magenta-400"
                />
              )}
              <input
                type="text"
                value={composeAsunto}
                onChange={e => setComposeAsunto(e.target.value)}
                placeholder="Asunto"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-magenta-400"
              />

              {/* Barra de formato */}
              <div className="flex items-center gap-1 flex-wrap border border-gray-200 rounded-t-lg px-2 py-1.5 bg-gray-50">
                <button onClick={() => formato('bold')} title="Negrita" className="px-2 py-1 text-sm font-bold text-gray-700 hover:bg-gray-200 rounded">
                  B
                </button>
                <button onClick={() => formato('underline')} title="Subrayado" className="px-2 py-1 text-sm underline text-gray-700 hover:bg-gray-200 rounded">
                  U
                </button>
                <span className="w-px h-5 bg-gray-300 mx-1" />
                {COLORES.map(c => (
                  <button
                    key={c}
                    onClick={() => formato('foreColor', c)}
                    title="Color de letra"
                    className="w-5 h-5 rounded-full border border-gray-300 hover:scale-110 transition-transform"
                    style={{ backgroundColor: c }}
                  />
                ))}
                <span className="w-px h-5 bg-gray-300 mx-1" />
                <button onClick={() => formato('insertUnorderedList')} title="Viñetas" className="px-2 py-1 text-sm text-gray-700 hover:bg-gray-200 rounded">
                  • Lista
                </button>
                <span className="w-px h-5 bg-gray-300 mx-1" />
                <button onClick={() => formato('fontSize', '3')} title="Tamaño normal" className="px-2 py-1 text-xs text-gray-700 hover:bg-gray-200 rounded">
                  Aa
                </button>
                <button onClick={() => formato('fontSize', '5')} title="Tamaño grande" className="px-2 py-1 text-base text-gray-700 hover:bg-gray-200 rounded">
                  Aa
                </button>
              </div>
              <div
                ref={editorRef}
                contentEditable
                className="w-full min-h-[180px] px-3 py-2 border border-t-0 border-gray-200 rounded-b-lg text-sm focus:outline-none focus:border-magenta-400 -mt-3"
                style={{ marginTop: '-12px' }}
              />

              <div className="flex items-center gap-3 flex-wrap">
                <label className="inline-flex items-center gap-2 px-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 cursor-pointer text-gray-700">
                  <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                  </svg>
                  Adjuntar archivos
                  <input type="file" multiple onChange={agregarAdjuntosCompose} className="hidden" />
                </label>
                {composeAdjuntos.map((a, i) => (
                  <span key={i} className="inline-flex items-center gap-2 px-2.5 py-1 text-xs bg-gray-50 border border-gray-200 rounded-full text-gray-700">
                    {a.filename}
                    <button
                      onClick={() => setComposeAdjuntos(prev => prev.filter((_, j) => j !== i))}
                      className="text-gray-400 hover:text-gray-700 font-bold"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
              {composeError && (
                <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{composeError}</p>
              )}
            </div>
            <div className="px-5 py-3 border-t border-gray-200 flex justify-end gap-2">
              <button onClick={cerrarCompose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
                Cancelar
              </button>
              <button
                onClick={enviarCompose}
                disabled={composeEnviando}
                className="px-5 py-2 text-sm font-semibold bg-magenta-600 text-white rounded-lg hover:bg-magenta-700 disabled:opacity-50"
              >
                {composeEnviando ? 'Enviando...' : 'Enviar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
