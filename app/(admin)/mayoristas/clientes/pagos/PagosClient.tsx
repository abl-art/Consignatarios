'use client'

import { useState, useRef, useMemo } from 'react'
import { formatearMoneda } from '@/lib/utils'
import { asentarPago, asentarPagosBulk } from '@/lib/actions/pagos-mayoristas'
import { parseEcheqs } from '@/lib/parse-echeqs'
import type { ClienteMayorista, ExtraccionPago, ExposicionRiesgo } from '@/lib/types'

interface Props {
  clientes: ClienteMayorista[]
  exposicion: ExposicionRiesgo[]
}

const tabs = [
  { id: 'asentar', label: 'Asentar Pago' },
  { id: 'echeqs', label: 'Carga Echeqs' },
  { id: 'riesgo', label: 'Exposición al Riesgo' },
] as const

export default function PagosClient({ clientes, exposicion }: Props) {
  const [active, setActive] = useState<string>('asentar')

  return (
    <div>
      <div className="flex border-b border-gray-200 mb-6">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActive(tab.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              active === tab.id
                ? 'border-magenta-600 text-magenta-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className={active === 'asentar' ? '' : 'hidden'}>
        <AsentarPagoTab clientes={clientes} />
      </div>
      <div className={active === 'echeqs' ? '' : 'hidden'}>
        <CargaEcheqsTab clientes={clientes} />
      </div>
      <div className={active === 'riesgo' ? '' : 'hidden'}>
        <RiesgoTab exposicion={exposicion} />
      </div>
    </div>
  )
}

// ==========================================================================
// Asentar Pago Tab
// ==========================================================================

function AsentarPagoTab({ clientes }: { clientes: ClienteMayorista[] }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState(false)
  const [extraccion, setExtraccion] = useState<ExtraccionPago | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)

  // Form state
  const [clienteId, setClienteId] = useState('')
  const [monto, setMonto] = useState('')
  const [fechaCobro, setFechaCobro] = useState('')
  const [cuitEmisor, setCuitEmisor] = useState('')
  const [tipo, setTipo] = useState<'echeq' | 'transferencia' | 'efectivo' | 'orden_pago'>('echeq')
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)
  const [saving, setSaving] = useState(false)

  function handleTipoChange(nuevoTipo: typeof tipo) {
    setTipo(nuevoTipo)
    if ((nuevoTipo === 'transferencia' || nuevoTipo === 'efectivo') && !fechaCobro) {
      setFechaCobro(new Date().toISOString().slice(0, 10))
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setFile(f)
    setPreview(f.type === 'application/pdf' ? 'pdf' : URL.createObjectURL(f))
    setLoading(true)
    setMensaje(null)

    try {
      const formData = new FormData()
      formData.append('imagen', f)
      const res = await fetch('/api/extraer-pago', { method: 'POST', body: formData })
      const data: ExtraccionPago = await res.json()
      setExtraccion(data)

      if (data.monto !== null) setMonto(String(data.monto))
      if (data.fecha_cobro) setFechaCobro(data.fecha_cobro)
      if (data.cuit_emisor) setCuitEmisor(data.cuit_emisor)
      if (data.tipo_detectado) setTipo(data.tipo_detectado)

      if (data.cuit_emisor) {
        const cuitNorm = data.cuit_emisor.replace(/-/g, '')
        const match = clientes.find(c => c.cuit && c.cuit.replace(/-/g, '') === cuitNorm)
        if (match) setClienteId(match.id)
      }

      if (data.confianza >= 0.85 && data.monto && data.fecha_cobro && data.cuit_emisor) {
        const cuitNorm = data.cuit_emisor.replace(/-/g, '')
        const match = clientes.find(c => c.cuit && c.cuit.replace(/-/g, '') === cuitNorm)
        if (match) {
          await submitPago({
            clienteId: match.id,
            monto: data.monto,
            fechaCobro: data.fecha_cobro,
            cuitEmisor: data.cuit_emisor,
            tipo: data.tipo_detectado || 'echeq',
            file: f,
            confianza: data.confianza,
          })
        }
      }
    } catch {
      setMensaje({ tipo: 'error', texto: 'Error al procesar la imagen' })
    } finally {
      setLoading(false)
    }
  }

  async function submitPago(override?: {
    clienteId: string
    monto: number
    fechaCobro: string
    cuitEmisor: string
    tipo: 'echeq' | 'transferencia' | 'efectivo' | 'orden_pago'
    file: File | null
    confianza: number | null
  }) {
    const cId = override?.clienteId ?? clienteId
    const m = override?.monto ?? Number(monto)
    const fc = override?.fechaCobro ?? fechaCobro
    const cuit = override?.cuitEmisor ?? cuitEmisor
    const t = override?.tipo ?? tipo
    const f = override?.file ?? file
    const conf = override?.confianza ?? extraccion?.confianza ?? null

    if (!cId || !m || !fc || !cuit) {
      setMensaje({ tipo: 'error', texto: 'Completá todos los campos obligatorios' })
      return
    }

    setSaving(true)
    setMensaje(null)

    try {
      let comprobanteUrl: string | null = null
      if (f) {
        const { createClient } = await import('@/lib/supabase/client')
        const supabase = createClient()
        const ext = f.name.split('.').pop() || 'jpg'
        const path = `${cId}/${Date.now()}.${ext}`
        const { error: upErr } = await supabase.storage
          .from('comprobantes-mayoristas')
          .upload(path, f)
        if (!upErr) {
          const { data: urlData } = supabase.storage
            .from('comprobantes-mayoristas')
            .getPublicUrl(path)
          comprobanteUrl = urlData.publicUrl
        }
      }

      const result = await asentarPago({
        cliente_mayorista_id: cId,
        monto: m,
        fecha_cobro: fc,
        cuit_emisor: cuit,
        tipo: t,
        comprobante_url: comprobanteUrl,
        confianza_extraccion: conf,
      })

      if ('error' in result) {
        setMensaje({ tipo: 'error', texto: result.error! })
      } else {
        setMensaje({ tipo: 'ok', texto: `Pago de ${formatearMoneda(m)} asentado correctamente` })
        setClienteId('')
        setMonto('')
        setFechaCobro('')
        setCuitEmisor('')
        setTipo('echeq')
        setFile(null)
        setPreview(null)
        setExtraccion(null)
        if (fileRef.current) fileRef.current.value = ''
      }
    } catch {
      setMensaje({ tipo: 'error', texto: 'Error al asentar el pago' })
    } finally {
      setSaving(false)
    }
  }

  const needsConfirmation = extraccion && extraccion.confianza < 0.85

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Upload zone */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
        <h3 className="text-sm font-semibold text-gray-700">Subir comprobante</h3>
        <div
          onClick={() => fileRef.current?.click()}
          className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-gray-400 hover:bg-gray-50 transition"
        >
          {preview ? (
            preview === 'pdf' ? (
              <div className="text-gray-600">
                <svg className="w-12 h-12 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
                <p className="text-sm font-medium">{file?.name || 'PDF cargado'}</p>
              </div>
            ) : (
              <img src={preview} alt="Comprobante" className="max-h-48 mx-auto rounded-lg" />
            )
          ) : (
            <div className="text-gray-400">
              <svg className="w-10 h-10 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <p className="text-sm">Click o arrastrá un archivo</p>
              <p className="text-xs text-gray-300 mt-1">PDF, imagen de echeq, orden de pago</p>
            </div>
          )}
        </div>
        <input ref={fileRef} type="file" accept="image/*,.pdf,application/pdf" className="hidden" onChange={handleUpload} />
        {loading && (
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <div className="w-4 h-4 border-2 border-gray-600 border-t-transparent rounded-full animate-spin" />
            Extrayendo datos...
          </div>
        )}
        {extraccion && !loading && (
          <div className="bg-gray-50 rounded-lg p-3 text-xs space-y-1">
            <p>Confianza: <span className={`font-bold ${extraccion.confianza >= 0.85 ? 'text-emerald-600' : 'text-yellow-600'}`}>{Math.round(extraccion.confianza * 100)}%</span></p>
            {extraccion.confianza >= 0.85 && <p className="text-emerald-600 font-medium">Asentado automaticamente</p>}
            {needsConfirmation && <p className="text-yellow-600 font-medium">Revisá los datos y confirmá</p>}
          </div>
        )}
      </div>

      {/* Form */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
        <h3 className="text-sm font-semibold text-gray-700">
          {needsConfirmation ? 'Confirmar datos extraídos' : 'Datos del pago'}
        </h3>

        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">Cliente *</label>
          <select
            value={clienteId}
            onChange={e => setClienteId(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            <option value="">Seleccionar...</option>
            {clientes.map(c => (
              <option key={c.id} value={c.id}>{c.nombre_comercial} {c.cuit ? `(${c.cuit})` : ''}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Monto *</label>
            <input
              type="number"
              value={monto}
              onChange={e => setMonto(e.target.value)}
              placeholder="0.00"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Fecha de cobro *</label>
            <input
              type="date"
              value={fechaCobro}
              onChange={e => setFechaCobro(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">CUIT emisor *</label>
            <input
              type="text"
              value={cuitEmisor}
              onChange={e => setCuitEmisor(e.target.value)}
              placeholder="XX-XXXXXXXX-X"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Tipo</label>
            <select
              value={tipo}
              onChange={e => handleTipoChange(e.target.value as typeof tipo)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            >
              <option value="echeq">Echeq</option>
              <option value="transferencia">Transferencia</option>
              <option value="efectivo">Efectivo</option>
              <option value="orden_pago">Orden de Pago</option>
            </select>
          </div>
        </div>

        {mensaje && (
          <div className={`p-3 rounded-lg text-sm ${mensaje.tipo === 'ok' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
            {mensaje.texto}
          </div>
        )}

        <button
          onClick={() => submitPago()}
          disabled={saving || !clienteId || !monto || !fechaCobro || !cuitEmisor}
          className="w-full py-2.5 bg-gray-900 text-white font-medium rounded-lg text-sm hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? 'Asentando...' : 'Asentar Pago'}
        </button>
      </div>
    </div>
  )
}

// ==========================================================================
// Carga Echeqs Tab
// ==========================================================================

function CargaEcheqsTab({ clientes }: { clientes: ClienteMayorista[] }) {
  const [texto, setTexto] = useState('')
  const [clienteId, setClienteId] = useState('')
  const [saving, setSaving] = useState(false)
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)

  const { cheques, errores } = useMemo(() => parseEcheqs(texto), [texto])
  const total = cheques.reduce((s, c) => s + c.monto, 0)

  const fmtFecha = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`

  async function guardar() {
    if (!clienteId || cheques.length === 0) return
    setSaving(true)
    setMensaje(null)
    try {
      const result = await asentarPagosBulk({
        cliente_mayorista_id: clienteId,
        pagos: cheques.map(c => ({
          monto: c.monto,
          fecha_cobro: c.fecha_cobro,
          cuit_emisor: c.cuit_emisor,
          nro_cheque: c.nro_cheque,
          emisor: c.emisor,
        })),
      })
      if ('error' in result) {
        setMensaje({ tipo: 'error', texto: result.error! })
      } else {
        setMensaje({ tipo: 'ok', texto: `${result.cantidad} echeqs asentados por ${formatearMoneda(total)}` })
        setTexto('')
        setClienteId('')
      }
    } catch {
      setMensaje({ tipo: 'error', texto: 'Error al asentar los echeqs' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Pegado de texto */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-700">Pegar echeqs</h3>
          <p className="text-xs text-gray-500 mt-1">
            Pegá el texto tal cual te llega: número, código, emisor, CUIT, fecha de emisión, fecha de cobro y monto de cada cheque.
          </p>
        </div>
        <textarea
          value={texto}
          onChange={e => setTexto(e.target.value)}
          rows={14}
          placeholder={'30095246\nJXON1Q65ZJP2Z64\nEnrique Eduardo Olea\n20 38509655 1\n07/08/26\n05/11/26\n$ 452.866,75\n...'}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
        />
        {errores.length > 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 space-y-1">
            {errores.map((e, i) => (
              <p key={i} className="text-xs text-yellow-700">⚠ {e}</p>
            ))}
          </div>
        )}
      </div>

      {/* Vista previa */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
        <h3 className="text-sm font-semibold text-gray-700">
          Vista previa {cheques.length > 0 && `— ${cheques.length} cheques`}
        </h3>

        {cheques.length === 0 ? (
          <p className="text-sm text-gray-400 py-8 text-center">Los cheques detectados van a aparecer acá</p>
        ) : (
          <>
            <div className="overflow-x-auto -mx-1">
              <table className="w-full text-xs">
                <thead className="border-b border-gray-200">
                  <tr>
                    <th className="text-left px-2 py-2 font-medium text-gray-500">Nro</th>
                    <th className="text-left px-2 py-2 font-medium text-gray-500">Emisor</th>
                    <th className="text-left px-2 py-2 font-medium text-gray-500">CUIT</th>
                    <th className="text-right px-2 py-2 font-medium text-gray-500">Cobro</th>
                    <th className="text-right px-2 py-2 font-medium text-gray-500">Monto</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {cheques.map(c => (
                    <tr key={c.codigo}>
                      <td className="px-2 py-2 tabular-nums text-gray-700">{c.nro_cheque}</td>
                      <td className="px-2 py-2 text-gray-900">{c.emisor}</td>
                      <td className="px-2 py-2 tabular-nums text-gray-500">{c.cuit_emisor}</td>
                      <td className="px-2 py-2 text-right tabular-nums text-gray-700">{fmtFecha(c.fecha_cobro)}</td>
                      <td className="px-2 py-2 text-right tabular-nums font-medium text-gray-900">{formatearMoneda(c.monto)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t-2 border-gray-300">
                  <tr className="font-bold">
                    <td colSpan={4} className="px-2 py-2 text-gray-900">Total</td>
                    <td className="px-2 py-2 text-right tabular-nums text-gray-900">{formatearMoneda(total)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Cliente que endosa *</label>
              <select
                value={clienteId}
                onChange={e => setClienteId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                <option value="">Seleccionar...</option>
                {clientes.map(c => (
                  <option key={c.id} value={c.id}>{c.nombre_comercial} {c.cuit ? `(${c.cuit})` : ''}</option>
                ))}
              </select>
            </div>

            {mensaje && (
              <div className={`p-3 rounded-lg text-sm ${mensaje.tipo === 'ok' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                {mensaje.texto}
              </div>
            )}

            <button
              onClick={guardar}
              disabled={saving || !clienteId || cheques.length === 0}
              className="w-full py-2.5 bg-gray-900 text-white font-medium rounded-lg text-sm hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? 'Asentando...' : `Asentar ${cheques.length} echeqs por ${formatearMoneda(total)}`}
            </button>
          </>
        )}
        {mensaje && cheques.length === 0 && (
          <div className={`p-3 rounded-lg text-sm ${mensaje.tipo === 'ok' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
            {mensaje.texto}
          </div>
        )}
      </div>
    </div>
  )
}

// ==========================================================================
// Riesgo Tab
// ==========================================================================

function RiesgoTab({ exposicion }: { exposicion: ExposicionRiesgo[] }) {
  const [filtro, setFiltro] = useState<'todos' | 'verde' | 'amarillo' | 'rojo' | 'bloqueado'>('todos')

  const filtered = filtro === 'todos'
    ? exposicion
    : exposicion.filter(e => e.estado === filtro)

  const estadoColor = {
    verde: 'bg-green-100 text-green-800',
    amarillo: 'bg-yellow-100 text-yellow-800',
    rojo: 'bg-red-100 text-red-800',
    bloqueado: 'bg-gray-900 text-white',
  }

  const barColor = {
    verde: 'bg-green-500',
    amarillo: 'bg-yellow-500',
    rojo: 'bg-red-500',
    bloqueado: 'bg-gray-900',
  }

  return (
    <div>
      {/* Filters */}
      <div className="flex gap-2 flex-wrap mb-4">
        {(['todos', 'verde', 'amarillo', 'rojo', 'bloqueado'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFiltro(f)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              filtro === f ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">Cliente</th>
              <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500">Límite CC</th>
              <th className="text-right px-4 py-2.5 text-xs font-semibold text-red-600">Deuda</th>
              <th className="text-right px-4 py-2.5 text-xs font-semibold text-green-600">Acreditado</th>
              <th className="text-right px-4 py-2.5 text-xs font-semibold text-blue-600">Pendiente</th>
              <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500">Saldo</th>
              <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 w-32">Utilización</th>
              <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 w-24">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-gray-400 text-sm">
                  No hay clientes con este estado
                </td>
              </tr>
            ) : (
              filtered.map(e => (
                <tr key={e.cliente_id} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 font-medium text-gray-900 text-sm">{e.nombre_comercial}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-sm text-gray-600">
                    {e.limite_cc ? formatearMoneda(e.limite_cc) : 'Sin límite'}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-sm text-red-700">{formatearMoneda(e.deuda)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-sm text-green-700">{formatearMoneda(e.pagos_acreditados)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-sm text-blue-600">{formatearMoneda(e.pendiente_cobro)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-sm font-bold text-gray-900">{formatearMoneda(e.saldo)}</td>
                  <td className="px-4 py-2.5">
                    {e.porcentaje_utilizacion !== null ? (
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${barColor[e.estado]}`}
                            style={{ width: `${Math.min(e.porcentaje_utilizacion, 100)}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-500 w-8 text-right">{e.porcentaje_utilizacion}%</span>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full ${estadoColor[e.estado]}`}>
                      {e.estado}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {filtered.length > 0 && (
            <tfoot className="bg-gray-50 border-t-2 border-gray-300">
              <tr>
                <td className="px-4 py-2.5 font-bold text-gray-900 text-sm">Totales</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-sm font-bold text-gray-600">
                  {formatearMoneda(filtered.reduce((s, e) => s + (e.limite_cc || 0), 0))}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-sm font-bold text-red-700">
                  {formatearMoneda(filtered.reduce((s, e) => s + e.deuda, 0))}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-sm font-bold text-green-700">
                  {formatearMoneda(filtered.reduce((s, e) => s + e.pagos_acreditados, 0))}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-sm font-bold text-blue-600">
                  {formatearMoneda(filtered.reduce((s, e) => s + e.pendiente_cobro, 0))}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-sm font-bold text-gray-900">
                  {formatearMoneda(filtered.reduce((s, e) => s + e.saldo, 0))}
                </td>
                <td className="px-4 py-2.5" />
                <td className="px-4 py-2.5" />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}
