'use client'

import React, { useState } from 'react'
import { formatearMoneda } from '@/lib/utils'
import { actualizarClienteMayorista } from '@/lib/actions/clientes-mayoristas'
import { datosEntregaIncompletos } from '@/lib/types'
import type { ClienteMayorista } from '@/lib/types'

interface Props {
  clientes: ClienteMayorista[]
}

export default function ClientesListado({ clientes }: Props) {
  const [editando, setEditando] = useState<string | null>(null)
  const [form, setForm] = useState<Partial<ClienteMayorista>>({})
  const [saving, setSaving] = useState(false)
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)

  // --- Entrega (warehouse) y condición de venta — sección aparte de la edición básica de arriba,
  // se abre con "Editar entrega" y guarda con el mismo actualizarClienteMayorista (Partial). ---
  const [entregaEditId, setEntregaEditId] = useState<string | null>(null)
  const [entregaForm, setEntregaForm] = useState<Partial<ClienteMayorista>>({})
  const [entregaSaving, setEntregaSaving] = useState(false)
  const [entregaMensaje, setEntregaMensaje] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)

  function startEntregaEdit(c: ClienteMayorista) {
    setEntregaEditId(c.id)
    setEntregaForm({
      gocuotas_store_id: c.gocuotas_store_id,
      plazo_dias: c.plazo_dias,
      entrega_nombre: c.entrega_nombre,
      entrega_dni: c.entrega_dni,
      entrega_telefono: c.entrega_telefono,
      entrega_email: c.entrega_email,
      entrega_calle: c.entrega_calle,
      entrega_numero: c.entrega_numero,
      entrega_piso_depto: c.entrega_piso_depto,
      entrega_localidad: c.entrega_localidad,
      entrega_cp: c.entrega_cp,
      entrega_provincia: c.entrega_provincia,
    })
    setEntregaMensaje(null)
  }

  function cancelEntregaEdit() {
    setEntregaEditId(null)
    setEntregaForm({})
    setEntregaMensaje(null)
  }

  async function saveEntregaEdit() {
    if (!entregaEditId) return
    setEntregaSaving(true)
    setEntregaMensaje(null)
    const result = await actualizarClienteMayorista(entregaEditId, {
      gocuotas_store_id: entregaForm.gocuotas_store_id?.trim() || null,
      plazo_dias: entregaForm.plazo_dias ?? 70,
      entrega_nombre: entregaForm.entrega_nombre?.trim() || null,
      entrega_dni: entregaForm.entrega_dni?.trim() || null,
      entrega_telefono: entregaForm.entrega_telefono?.trim() || null,
      entrega_email: entregaForm.entrega_email?.trim() || null,
      entrega_calle: entregaForm.entrega_calle?.trim() || null,
      entrega_numero: entregaForm.entrega_numero?.trim() || null,
      entrega_piso_depto: entregaForm.entrega_piso_depto?.trim() || null,
      entrega_localidad: entregaForm.entrega_localidad?.trim() || null,
      entrega_cp: entregaForm.entrega_cp?.trim() || null,
      entrega_provincia: entregaForm.entrega_provincia?.trim() || null,
    })
    setEntregaSaving(false)
    if ('error' in result) {
      setEntregaMensaje({ tipo: 'error', texto: result.error })
    } else {
      setEntregaMensaje({ tipo: 'ok', texto: 'Datos de entrega actualizados' })
      setEntregaEditId(null)
      setEntregaForm({})
    }
  }

  function startEdit(c: ClienteMayorista) {
    setEditando(c.id)
    setForm({
      nombre_comercial: c.nombre_comercial,
      razon_social: c.razon_social,
      condicion_iva: c.condicion_iva,
      cuit: c.cuit,
      telefono: c.telefono,
      email: c.email,
      direccion_entrega: c.direccion_entrega,
      transporte: c.transporte,
      limite_cuenta_corriente: c.limite_cuenta_corriente,
    })
    setMensaje(null)
  }

  function cancelEdit() {
    setEditando(null)
    setForm({})
    setMensaje(null)
  }

  async function saveEdit() {
    if (!editando) return
    setSaving(true)
    setMensaje(null)
    const result = await actualizarClienteMayorista(editando, {
      nombre_comercial: form.nombre_comercial?.trim() || '',
      razon_social: form.razon_social?.trim() || null,
      condicion_iva: form.condicion_iva || 'monotributo',
      cuit: form.cuit?.trim() || null,
      telefono: form.telefono?.trim() || null,
      email: form.email?.trim() || null,
      direccion_entrega: form.direccion_entrega?.trim() || null,
      transporte: form.transporte?.trim() || null,
      limite_cuenta_corriente: form.limite_cuenta_corriente ?? null,
    })
    setSaving(false)
    if ('error' in result) {
      setMensaje({ tipo: 'error', texto: result.error })
    } else {
      setMensaje({ tipo: 'ok', texto: 'Cliente actualizado' })
      setEditando(null)
      setForm({})
    }
  }

  return (
    <div>
      {mensaje && (
        <div className={`p-3 rounded-lg text-sm mb-4 ${mensaje.tipo === 'ok' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {mensaje.texto}
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">Nombre comercial</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">Razón social</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">IVA</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">CUIT</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">Teléfono</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">Email</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">Transporte</th>
              <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500">Límite CC</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">Entrega WH</th>
              <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 w-20"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {clientes.map((c) => (
              <React.Fragment key={c.id}>
              {editando === c.id ? (
                <tr className="bg-yellow-50">
                  <td className="px-4 py-2">
                    <input value={form.nombre_comercial || ''} onChange={e => setForm({ ...form, nombre_comercial: e.target.value })}
                      className="w-full px-2 py-1 border border-gray-300 rounded text-sm" />
                  </td>
                  <td className="px-4 py-2">
                    <input value={form.razon_social || ''} onChange={e => setForm({ ...form, razon_social: e.target.value })}
                      className="w-full px-2 py-1 border border-gray-300 rounded text-sm" />
                  </td>
                  <td className="px-4 py-2">
                    <select value={form.condicion_iva || 'monotributo'} onChange={e => setForm({ ...form, condicion_iva: e.target.value as 'monotributo' | 'inscripto' })}
                      className="px-2 py-1 border border-gray-300 rounded text-sm bg-white">
                      <option value="monotributo">Mono</option>
                      <option value="inscripto">RI</option>
                    </select>
                  </td>
                  <td className="px-4 py-2">
                    <input value={form.cuit || ''} onChange={e => setForm({ ...form, cuit: e.target.value })}
                      className="w-full px-2 py-1 border border-gray-300 rounded text-sm font-mono" />
                  </td>
                  <td className="px-4 py-2">
                    <input value={form.telefono || ''} onChange={e => setForm({ ...form, telefono: e.target.value })}
                      className="w-full px-2 py-1 border border-gray-300 rounded text-sm" />
                  </td>
                  <td className="px-4 py-2">
                    <input value={form.email || ''} onChange={e => setForm({ ...form, email: e.target.value })}
                      className="w-full px-2 py-1 border border-gray-300 rounded text-sm" />
                  </td>
                  <td className="px-4 py-2">
                    <input value={form.transporte || ''} onChange={e => setForm({ ...form, transporte: e.target.value })}
                      className="w-full px-2 py-1 border border-gray-300 rounded text-sm" />
                  </td>
                  <td className="px-4 py-2">
                    <input type="number" value={form.limite_cuenta_corriente ?? ''} onChange={e => setForm({ ...form, limite_cuenta_corriente: e.target.value ? Number(e.target.value) : null })}
                      placeholder="Sin límite"
                      className="w-full px-2 py-1 border border-gray-300 rounded text-sm text-right" />
                  </td>
                  <td className="px-4 py-2"></td>
                  <td className="px-4 py-2">
                    <div className="flex gap-1">
                      <button onClick={saveEdit} disabled={saving}
                        className="px-2 py-1 bg-gray-900 text-white text-xs rounded hover:bg-gray-700 disabled:opacity-50">
                        {saving ? '...' : 'OK'}
                      </button>
                      <button onClick={cancelEdit}
                        className="px-2 py-1 bg-white border border-gray-300 text-xs rounded hover:bg-gray-50">
                        X
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr className="hover:bg-gray-50 cursor-pointer" onClick={() => startEdit(c)}>
                  <td className="px-4 py-2.5 font-medium text-gray-900">{c.nombre_comercial}</td>
                  <td className="px-4 py-2.5 text-gray-600">{c.razon_social || '—'}</td>
                  <td className="px-4 py-2.5">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${c.condicion_iva === 'inscripto' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                      {c.condicion_iva === 'inscripto' ? 'RI' : 'Mono'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-gray-600 font-mono text-xs">{c.cuit || '—'}</td>
                  <td className="px-4 py-2.5 text-gray-600">{c.telefono || '—'}</td>
                  <td className="px-4 py-2.5 text-gray-600">{c.email || '—'}</td>
                  <td className="px-4 py-2.5 text-gray-600">{c.transporte || '—'}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-gray-600">
                    {c.limite_cuenta_corriente ? formatearMoneda(c.limite_cuenta_corriente) : '—'}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-col gap-0.5 items-start">
                      {datosEntregaIncompletos(c) ? (
                        <span className="text-[10px] text-amber-600">⚠ Datos de entrega incompletos</span>
                      ) : (
                        <span className="text-[10px] text-green-600">✓ Datos completos</span>
                      )}
                      {!c.gocuotas_store_id && (
                        <span className="text-[10px] text-red-600">⚠ Falta gocuotas_store_id</span>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); startEntregaEdit(c) }}
                        className="text-[11px] text-blue-600 underline"
                      >
                        Editar entrega
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <span className="text-xs text-gray-400">editar</span>
                  </td>
                </tr>
              )}
              {entregaEditId === c.id && (
                <tr className="bg-blue-50">
                  <td colSpan={10} className="px-4 py-4">
                    <div className="mb-3 flex items-center justify-between">
                      <h4 className="text-sm font-semibold text-gray-700">
                        Entrega (warehouse) y condición de venta — {c.nombre_comercial}
                      </h4>
                      <button onClick={cancelEntregaEdit} className="text-xs text-gray-400 hover:text-gray-600">Cerrar</button>
                    </div>
                    {entregaMensaje && (
                      <div className={`mb-3 p-2 rounded text-xs ${entregaMensaje.tipo === 'ok' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                        {entregaMensaje.texto}
                      </div>
                    )}
                    {datosEntregaIncompletos({ ...c, ...entregaForm } as ClienteMayorista) && (
                      <p className="mb-2 text-xs text-amber-600">⚠ Datos de entrega incompletos para warehouse</p>
                    )}
                    {!entregaForm.gocuotas_store_id && (
                      <p className="mb-3 text-xs text-red-600">⚠ Falta gocuotas_store_id — las ventas no se pueden informar a GOcelular</p>
                    )}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">GOcuotas Store ID</label>
                        <input value={entregaForm.gocuotas_store_id || ''} onChange={e => setEntregaForm({ ...entregaForm, gocuotas_store_id: e.target.value })}
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm" />
                        <p className="text-[10px] text-gray-400 mt-0.5">ID del local en GOcuotas — necesario para informar ventas a GOcelular</p>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Plazo (días)</label>
                        <input type="number" value={entregaForm.plazo_dias ?? 70} onChange={e => setEntregaForm({ ...entregaForm, plazo_dias: Number(e.target.value) })}
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Nombre destinatario *</label>
                        <input value={entregaForm.entrega_nombre || ''} onChange={e => setEntregaForm({ ...entregaForm, entrega_nombre: e.target.value })}
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">DNI *</label>
                        <input value={entregaForm.entrega_dni || ''} onChange={e => setEntregaForm({ ...entregaForm, entrega_dni: e.target.value })}
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Teléfono *</label>
                        <input value={entregaForm.entrega_telefono || ''} onChange={e => setEntregaForm({ ...entregaForm, entrega_telefono: e.target.value })}
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Email *</label>
                        <input value={entregaForm.entrega_email || ''} onChange={e => setEntregaForm({ ...entregaForm, entrega_email: e.target.value })}
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Calle *</label>
                        <input value={entregaForm.entrega_calle || ''} onChange={e => setEntregaForm({ ...entregaForm, entrega_calle: e.target.value })}
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Número *</label>
                        <input value={entregaForm.entrega_numero || ''} onChange={e => setEntregaForm({ ...entregaForm, entrega_numero: e.target.value })}
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Piso/Depto</label>
                        <input value={entregaForm.entrega_piso_depto || ''} onChange={e => setEntregaForm({ ...entregaForm, entrega_piso_depto: e.target.value })}
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Localidad *</label>
                        <input value={entregaForm.entrega_localidad || ''} onChange={e => setEntregaForm({ ...entregaForm, entrega_localidad: e.target.value })}
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">CP *</label>
                        <input value={entregaForm.entrega_cp || ''} onChange={e => setEntregaForm({ ...entregaForm, entrega_cp: e.target.value })}
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Provincia *</label>
                        <input value={entregaForm.entrega_provincia || ''} onChange={e => setEntregaForm({ ...entregaForm, entrega_provincia: e.target.value })}
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm" />
                      </div>
                    </div>
                    <div className="mt-3 flex justify-end gap-2">
                      <button onClick={cancelEntregaEdit} className="px-3 py-1.5 bg-white border border-gray-300 text-xs rounded hover:bg-gray-50">
                        Cancelar
                      </button>
                      <button onClick={saveEntregaEdit} disabled={entregaSaving}
                        className="px-3 py-1.5 bg-gray-900 text-white text-xs rounded hover:bg-gray-700 disabled:opacity-50">
                        {entregaSaving ? 'Guardando...' : 'Guardar'}
                      </button>
                    </div>
                  </td>
                </tr>
              )}
              </React.Fragment>
            ))}
            {clientes.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-center text-gray-400">
                  No hay clientes registrados
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
