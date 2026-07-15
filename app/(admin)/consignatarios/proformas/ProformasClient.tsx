'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { formatearMoneda } from '@/lib/utils'
import { crearProforma, modificarProforma, confirmarProforma, eliminarProforma } from '@/lib/actions/proformas'
import type { ProductoConPrecio } from '@/lib/actions/lista-precios'
import type { Proforma, ProformaConItems } from '@/lib/actions/proformas'

interface LineaProforma {
  producto_id: string
  producto_nombre: string
  cantidad: number
  precio_costo: number
}

interface Props {
  productos: ProductoConPrecio[]
  mupInicial: number
  proformasGuardadas: Proforma[]
}

export default function ProformasClient({ productos, mupInicial, proformasGuardadas }: Props) {
  const router = useRouter()
  const [tab, setTab] = useState<'nueva' | 'historial'>('nueva')

  // --- Estado nueva/editar proforma ---
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [nombre, setNombre] = useState('')
  const [clienteNombre, setClienteNombre] = useState('')
  const [storeId, setStoreId] = useState('')
  const [notas, setNotas] = useState('')
  const [mup, setMup] = useState(mupInicial)
  const [lineas, setLineas] = useState<LineaProforma[]>([])
  const [productoSeleccionado, setProductoSeleccionado] = useState('')
  const [cantidad, setCantidad] = useState(1)
  const [saving, startSaving] = useTransition()
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)
  const [eliminandoId, setEliminandoId] = useState<string | null>(null)
  const [confirmandoId, setConfirmandoId] = useState<string | null>(null)

  function resetForm() {
    setEditandoId(null)
    setNombre('')
    setClienteNombre('')
    setStoreId('')
    setNotas('')
    setMup(mupInicial)
    setLineas([])
    setProductoSeleccionado('')
    setCantidad(1)
  }

  function calcPrecioVenta(costo: number) {
    return Math.round(costo * (1 + mup / 100))
  }

  function agregarLinea() {
    if (!productoSeleccionado) return
    const prod = productos.find(p => p.id === productoSeleccionado)
    if (!prod) return

    const existente = lineas.findIndex(l => l.producto_id === prod.id)
    if (existente >= 0) {
      const nuevas = [...lineas]
      nuevas[existente].cantidad += cantidad
      setLineas(nuevas)
    } else {
      setLineas([...lineas, {
        producto_id: prod.id,
        producto_nombre: prod.nombre,
        cantidad,
        precio_costo: prod.mejor_precio,
      }])
    }
    setProductoSeleccionado('')
    setCantidad(1)
  }

  function quitarLinea(index: number) {
    setLineas(lineas.filter((_, i) => i !== index))
  }

  function actualizarCantidad(index: number, nuevaCantidad: number) {
    if (nuevaCantidad < 1) return
    const nuevas = [...lineas]
    nuevas[index].cantidad = nuevaCantidad
    setLineas(nuevas)
  }

  const totalNeto = lineas.reduce((s, l) => s + calcPrecioVenta(l.precio_costo) * l.cantidad, 0)
  const totalIva = lineas.reduce((s, l) => s + Math.round(calcPrecioVenta(l.precio_costo) * 0.21) * l.cantidad, 0)
  const totalConIva = totalNeto + totalIva

  function handleGuardar() {
    if (lineas.length === 0) {
      setMensaje({ tipo: 'error', texto: 'Agregá al menos un producto' })
      return
    }
    startSaving(async () => {
      const payload = {
        nombre: nombre || `Proforma ${new Date().toLocaleDateString('es-AR')}`,
        cliente_nombre: clienteNombre,
        store_id: storeId,
        mup,
        notas,
        items: lineas,
      }

      const result = editandoId
        ? await modificarProforma(editandoId, payload)
        : await crearProforma(payload)

      if ('error' in result) {
        setMensaje({ tipo: 'error', texto: result.error! })
      } else {
        setMensaje({ tipo: 'ok', texto: editandoId ? 'Proforma actualizada' : 'Proforma guardada correctamente' })
        resetForm()
        setTab('historial')
        router.refresh()
      }
    })
  }

  async function handleEditar(proforma: Proforma) {
    // Cargar items de la proforma
    const res = await fetch(`/api/proforma/${proforma.id}`)
    if (!res.ok) {
      setMensaje({ tipo: 'error', texto: 'Error al cargar proforma' })
      return
    }
    const data: ProformaConItems = await res.json()

    setEditandoId(proforma.id)
    setNombre(proforma.nombre)
    setClienteNombre(proforma.cliente_nombre || '')
    setStoreId(proforma.store_id || '')
    setMup(proforma.mup)
    setNotas(proforma.notas || '')
    setLineas(data.proforma_items.map(i => ({
      producto_id: i.producto_id,
      producto_nombre: i.producto_nombre,
      cantidad: i.cantidad,
      precio_costo: i.precio_costo,
    })))
    setTab('nueva')
  }

  async function handleConfirmar(id: string) {
    if (!confirm('¿Confirmar esta proforma? Una vez confirmada no se puede modificar.')) return
    setConfirmandoId(id)
    const result = await confirmarProforma(id)
    if ('error' in result) {
      setMensaje({ tipo: 'error', texto: result.error! })
    } else {
      setMensaje({ tipo: 'ok', texto: 'Proforma confirmada. Ya podés asignar equipos en Asignaciones > Venta Mayorista.' })
    }
    setConfirmandoId(null)
    router.refresh()
  }

  async function handleEliminar(id: string) {
    if (!confirm('¿Eliminar esta proforma?')) return
    setEliminandoId(id)
    await eliminarProforma(id)
    router.refresh()
    setEliminandoId(null)
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Proformas</h1>
        <p className="text-sm text-gray-500 mt-1">Armá cotizaciones eligiendo modelos y cantidades</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {(['nueva', 'historial'] as const).map(t => (
          <button
            key={t}
            onClick={() => { setTab(t); if (t === 'nueva' && !editandoId) resetForm() }}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t
                ? 'border-magenta-600 text-magenta-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t === 'nueva' ? (editandoId ? 'Modificar Proforma' : 'Nueva Proforma') : `Historial (${proformasGuardadas.length})`}
          </button>
        ))}
      </div>

      {/* Mensaje */}
      {mensaje && (
        <div className={`p-3 rounded-lg text-sm ${mensaje.tipo === 'ok' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
          {mensaje.texto}
          <button onClick={() => setMensaje(null)} className="ml-2 underline">Cerrar</button>
        </div>
      )}

      {tab === 'nueva' ? (
        <div className="space-y-4">
          {editandoId && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-700 flex items-center justify-between">
              <span>Editando proforma existente</span>
              <button onClick={() => { resetForm(); setTab('historial') }} className="text-amber-600 underline text-xs">Cancelar edición</button>
            </div>
          )}

          {/* Nombre + Cliente + MUP */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-wrap items-end gap-4">
            <div className="flex-1 min-w-[180px]">
              <label className="text-sm font-medium text-gray-700 block mb-1">Nombre proforma</label>
              <input
                type="text"
                value={nombre}
                onChange={e => setNombre(e.target.value)}
                placeholder={`Proforma ${new Date().toLocaleDateString('es-AR')}`}
                className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-magenta-500 focus:border-transparent"
              />
            </div>
            <div className="flex-1 min-w-[180px]">
              <label className="text-sm font-medium text-gray-700 block mb-1">Cliente</label>
              <input
                type="text"
                value={clienteNombre}
                onChange={e => setClienteNombre(e.target.value)}
                placeholder="Nombre del cliente mayorista"
                className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-magenta-500 focus:border-transparent"
              />
            </div>
            <div className="min-w-[140px]">
              <label className="text-sm font-medium text-gray-700 block mb-1">Store ID (GOcelular)</label>
              <input
                type="text"
                value={storeId}
                onChange={e => setStoreId(e.target.value)}
                placeholder="ID de la tienda"
                className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-magenta-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">MUP %</label>
              <input
                type="number"
                min={0}
                max={200}
                value={mup}
                onChange={e => setMup(Number(e.target.value))}
                className="w-20 px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-center focus:ring-2 focus:ring-magenta-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Agregar producto */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[200px]">
              <label className="text-sm font-medium text-gray-700 block mb-1">Modelo</label>
              <select
                value={productoSeleccionado}
                onChange={e => setProductoSeleccionado(e.target.value)}
                className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-magenta-500 focus:border-transparent"
              >
                <option value="">Seleccionar modelo...</option>
                {productos.sort((a, b) => a.nombre.localeCompare(b.nombre)).map(p => (
                  <option key={p.id} value={p.id}>
                    {p.nombre} — {formatearMoneda(calcPrecioVenta(p.mejor_precio))} + IVA
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Cantidad</label>
              <input
                type="number"
                min={1}
                value={cantidad}
                onChange={e => setCantidad(Math.max(1, Number(e.target.value)))}
                className="w-20 px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-center focus:ring-2 focus:ring-magenta-500 focus:border-transparent"
              />
            </div>
            <button
              onClick={agregarLinea}
              disabled={!productoSeleccionado}
              className="px-4 py-1.5 bg-magenta-600 text-white rounded-lg hover:bg-magenta-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Agregar
            </button>
          </div>

          {/* Tabla de lineas */}
          {lineas.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-6 py-3 font-medium text-gray-600">Modelo</th>
                    <th className="text-center px-4 py-3 font-medium text-gray-600">Cant.</th>
                    <th className="text-right px-6 py-3 font-medium text-gray-600">P. Unit. Neto</th>
                    <th className="text-right px-6 py-3 font-medium text-gray-600">IVA Unit.</th>
                    <th className="text-right px-6 py-3 font-medium text-gray-600">Subtotal c/IVA</th>
                    <th className="text-center px-4 py-3 font-medium text-gray-600"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {lineas.map((linea, i) => {
                    const pv = calcPrecioVenta(linea.precio_costo)
                    const iva = Math.round(pv * 0.21)
                    const sub = (pv + iva) * linea.cantidad
                    return (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-6 py-3 font-medium text-gray-900">{linea.producto_nombre}</td>
                        <td className="px-4 py-3 text-center">
                          <input
                            type="number"
                            min={1}
                            value={linea.cantidad}
                            onChange={e => actualizarCantidad(i, Number(e.target.value))}
                            className="w-16 px-2 py-1 border border-gray-300 rounded text-sm text-center"
                          />
                        </td>
                        <td className="px-6 py-3 text-right tabular-nums">{formatearMoneda(pv)}</td>
                        <td className="px-6 py-3 text-right text-gray-500 tabular-nums">{formatearMoneda(iva)}</td>
                        <td className="px-6 py-3 text-right font-bold text-magenta-700 tabular-nums">{formatearMoneda(sub)}</td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => quitarLinea(i)}
                            className="text-red-400 hover:text-red-600 transition-colors"
                            title="Quitar"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot className="bg-gray-50 border-t border-gray-200">
                  <tr>
                    <td className="px-6 py-3 font-bold text-gray-900" colSpan={2}>
                      Total ({lineas.reduce((s, l) => s + l.cantidad, 0)} unidades)
                    </td>
                    <td className="px-6 py-3 text-right font-medium tabular-nums">{formatearMoneda(totalNeto)}</td>
                    <td className="px-6 py-3 text-right text-gray-500 tabular-nums">{formatearMoneda(totalIva)}</td>
                    <td className="px-6 py-3 text-right font-bold text-magenta-700 text-base tabular-nums">{formatearMoneda(totalConIva)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {/* Notas */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <label className="text-sm font-medium text-gray-700 block mb-1">Notas (opcional)</label>
            <textarea
              value={notas}
              onChange={e => setNotas(e.target.value)}
              rows={2}
              placeholder="Observaciones, condiciones, etc."
              className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-magenta-500 focus:border-transparent"
            />
          </div>

          {/* Botón guardar */}
          <div className="flex justify-end">
            <button
              onClick={handleGuardar}
              disabled={saving || lineas.length === 0}
              className="px-6 py-2 bg-magenta-600 text-white rounded-lg hover:bg-magenta-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Guardando...' : editandoId ? 'Actualizar Proforma' : 'Guardar Proforma'}
            </button>
          </div>
        </div>
      ) : (
        /* Historial */
        <div className="space-y-4">
          {proformasGuardadas.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400">
              No hay proformas guardadas todavía
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-6 py-3 font-medium text-gray-600">Nombre</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Cliente</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Fecha</th>
                    <th className="text-center px-4 py-3 font-medium text-gray-600">Estado</th>
                    <th className="text-right px-6 py-3 font-medium text-gray-600">Total c/IVA</th>
                    <th className="text-center px-4 py-3 font-medium text-gray-600">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {proformasGuardadas.map(p => (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-6 py-3 font-medium text-gray-900">{p.nombre || 'Sin nombre'}</td>
                      <td className="px-4 py-3 text-gray-600">{p.cliente_nombre || '—'}</td>
                      <td className="px-4 py-3 text-gray-600">
                        {new Date(p.fecha).toLocaleDateString('es-AR')}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2.5 py-1 text-xs font-semibold rounded-full ${
                          p.estado === 'confirmada'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-amber-100 text-amber-700'
                        }`}>
                          {p.estado === 'confirmada' ? 'Confirmada' : 'Borrador'}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-right font-bold text-magenta-700 tabular-nums">
                        {formatearMoneda(p.total_con_iva)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1.5 flex-wrap">
                          <a
                            href={`/api/pdf/proforma/${p.id}`}
                            target="_blank"
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-magenta-600 text-white rounded-lg hover:bg-magenta-700 transition-colors text-xs font-medium"
                          >
                            PDF
                          </a>
                          {p.estado === 'borrador' && (
                            <>
                              <button
                                onClick={() => handleEditar(p)}
                                className="px-2.5 py-1 text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors text-xs font-medium"
                              >
                                Modificar
                              </button>
                              <button
                                onClick={() => handleConfirmar(p.id)}
                                disabled={confirmandoId === p.id}
                                className="px-2.5 py-1 text-green-700 border border-green-200 rounded-lg hover:bg-green-50 transition-colors text-xs font-medium disabled:opacity-50"
                              >
                                {confirmandoId === p.id ? '...' : 'Confirmar'}
                              </button>
                              <button
                                onClick={() => handleEliminar(p.id)}
                                disabled={eliminandoId === p.id}
                                className="px-2.5 py-1 text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors text-xs font-medium disabled:opacity-50"
                              >
                                {eliminandoId === p.id ? '...' : 'Eliminar'}
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
