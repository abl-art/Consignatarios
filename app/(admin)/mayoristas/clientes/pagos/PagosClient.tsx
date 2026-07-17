'use client'

import { useState, useRef } from 'react'
import { formatearMoneda } from '@/lib/utils'
import { asentarPago } from '@/lib/actions/pagos-mayoristas'
import type { ClienteMayorista, ExtraccionPago, ExposicionRiesgo } from '@/lib/types'

interface Props {
  clientes: ClienteMayorista[]
  exposicion: ExposicionRiesgo[]
}

type Tab = 'asentar' | 'riesgo'

export default function PagosClient({ clientes, exposicion }: Props) {
  const [tab, setTab] = useState<Tab>('asentar')

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        <button
          onClick={() => setTab('asentar')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition ${
            tab === 'asentar' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Asentar Pago
        </button>
        <button
          onClick={() => setTab('riesgo')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition ${
            tab === 'riesgo' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Exposición al Riesgo
        </button>
      </div>

      {tab === 'asentar' ? (
        <AsentarPagoTab clientes={clientes} />
      ) : (
        <RiesgoTab exposicion={exposicion} />
      )}
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

  // Default fecha_cobro to today for transferencia/efectivo
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

      // Pre-fill form
      if (data.monto !== null) setMonto(String(data.monto))
      if (data.fecha_cobro) setFechaCobro(data.fecha_cobro)
      if (data.cuit_emisor) setCuitEmisor(data.cuit_emisor)
      if (data.tipo_detectado) setTipo(data.tipo_detectado)

      // Auto-match client by CUIT
      if (data.cuit_emisor) {
        const cuitNorm = data.cuit_emisor.replace(/-/g, '')
        const match = clientes.find(c => c.cuit && c.cuit.replace(/-/g, '') === cuitNorm)
        if (match) setClienteId(match.id)
      }

      // If high confidence, auto-submit
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
      // Upload image if present
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
        // Reset form
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
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <h3 className="font-semibold text-gray-900">Subir comprobante</h3>
        <div
          onClick={() => fileRef.current?.click()}
          className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/50 transition"
        >
          {preview ? (
            preview === 'pdf' ? (
              <div className="text-blue-600">
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
          <div className="flex items-center gap-2 text-sm text-blue-600">
            <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            Extrayendo datos...
          </div>
        )}
        {extraccion && !loading && (
          <div className="bg-gray-50 rounded-lg p-3 text-xs space-y-1">
            <p>Confianza: <span className={`font-bold ${extraccion.confianza >= 0.85 ? 'text-green-600' : 'text-amber-600'}`}>{Math.round(extraccion.confianza * 100)}%</span></p>
            {extraccion.confianza >= 0.85 && <p className="text-green-600 font-medium">Asentado automaticamente</p>}
            {needsConfirmation && <p className="text-amber-600 font-medium">Revisa los datos y confirma</p>}
          </div>
        )}
      </div>

      {/* Form */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <h3 className="font-semibold text-gray-900">
          {needsConfirmation ? 'Confirmar datos extraídos' : 'Datos del pago'}
        </h3>

        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1">Cliente *</label>
          <select
            value={clienteId}
            onChange={e => setClienteId(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="">Seleccionar...</option>
            {clientes.map(c => (
              <option key={c.id} value={c.id}>{c.nombre_comercial} {c.cuit ? `(${c.cuit})` : ''}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Monto *</label>
            <input
              type="number"
              value={monto}
              onChange={e => setMonto(e.target.value)}
              placeholder="0.00"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Fecha de cobro *</label>
            <input
              type="date"
              value={fechaCobro}
              onChange={e => setFechaCobro(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">CUIT emisor *</label>
            <input
              type="text"
              value={cuitEmisor}
              onChange={e => setCuitEmisor(e.target.value)}
              placeholder="XX-XXXXXXXX-X"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Tipo</label>
            <select
              value={tipo}
              onChange={e => handleTipoChange(e.target.value as typeof tipo)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
          className="w-full py-2.5 bg-blue-600 text-white font-medium rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          {saving ? 'Asentando...' : 'Asentar Pago'}
        </button>
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
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {(['todos', 'verde', 'amarillo', 'rojo', 'bloqueado'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFiltro(f)}
            className={`px-3 py-1.5 text-xs font-medium rounded-full transition ${
              filtro === f ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Cliente</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Límite CC</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Deuda</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Acreditado</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Pendiente</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Saldo</th>
              <th className="px-4 py-3 font-medium text-gray-600 w-32">Utilización</th>
              <th className="px-4 py-3 font-medium text-gray-600 w-24">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-gray-400">
                  No hay clientes con este estado
                </td>
              </tr>
            ) : (
              filtered.map(e => (
                <tr key={e.cliente_id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{e.nombre_comercial}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-600">
                    {e.limite_cc ? formatearMoneda(e.limite_cc) : 'Sin límite'}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-red-600">{formatearMoneda(e.deuda)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-green-600">{formatearMoneda(e.pagos_acreditados)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-blue-600">{formatearMoneda(e.pendiente_cobro)}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-bold text-gray-900">{formatearMoneda(e.saldo)}</td>
                  <td className="px-4 py-3">
                    {e.porcentaje_utilizacion !== null ? (
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
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
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full ${estadoColor[e.estado]}`}>
                      {e.estado}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
