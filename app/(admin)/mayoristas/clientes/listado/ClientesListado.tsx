'use client'

import { useState } from 'react'
import { formatearMoneda } from '@/lib/utils'
import { actualizarClienteMayorista } from '@/lib/actions/clientes-mayoristas'
import type { ClienteMayorista } from '@/lib/types'

interface Props {
  clientes: ClienteMayorista[]
}

export default function ClientesListado({ clientes }: Props) {
  const [editando, setEditando] = useState<string | null>(null)
  const [form, setForm] = useState<Partial<ClienteMayorista>>({})
  const [saving, setSaving] = useState(false)
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)

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
              <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 w-20"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {clientes.map((c) => (
              editando === c.id ? (
                <tr key={c.id} className="bg-yellow-50">
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
                <tr key={c.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => startEdit(c)}>
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
                  <td className="px-4 py-2.5 text-center">
                    <span className="text-xs text-gray-400">editar</span>
                  </td>
                </tr>
              )
            ))}
            {clientes.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-gray-400">
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
