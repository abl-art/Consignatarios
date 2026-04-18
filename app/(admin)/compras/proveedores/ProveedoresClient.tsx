'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { agregarProveedor, editarProveedor, eliminarProveedor } from '@/lib/actions/compras'

interface Proveedor {
  id: string
  nombre: string
  contacto: string
  cuit: string
  whatsapp: string
  email: string
  direccion: string
  notas: string
}

const emptyForm = { nombre: '', contacto: '', cuit: '', whatsapp: '', email: '', direccion: '', notas: '' }

export default function ProveedoresClient({ proveedores }: { proveedores: Proveedor[] }) {
  const router = useRouter()
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [loading, setLoading] = useState(false)

  function startCreate() {
    setEditingId(null)
    setForm(emptyForm)
    setShowForm(true)
  }

  function startEdit(p: Proveedor) {
    setEditingId(p.id)
    setForm({
      nombre: p.nombre || '',
      contacto: p.contacto || '',
      cuit: p.cuit || '',
      whatsapp: p.whatsapp || '',
      email: p.email || '',
      direccion: p.direccion || '',
      notas: p.notas || '',
    })
    setShowForm(true)
  }

  function cancelForm() {
    setShowForm(false)
    setEditingId(null)
    setForm(emptyForm)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.nombre.trim()) return
    setLoading(true)
    if (editingId) {
      await editarProveedor(editingId, form)
    } else {
      await agregarProveedor(form)
    }
    setLoading(false)
    cancelForm()
    router.refresh()
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar este proveedor?')) return
    setLoading(true)
    await eliminarProveedor(id)
    setLoading(false)
    router.refresh()
  }

  function updateField(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link
            href="/compras"
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Compras
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">Proveedores</h1>
        </div>
        <button
          onClick={startCreate}
          className="px-5 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 transition-colors"
        >
          Nuevo Proveedor
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            {editingId ? 'Editar Proveedor' : 'Nuevo Proveedor'}
          </h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Nombre *</label>
                <input
                  type="text"
                  value={form.nombre}
                  onChange={(e) => updateField('nombre', e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  placeholder="Nombre del proveedor"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Contacto</label>
                <input
                  type="text"
                  value={form.contacto}
                  onChange={(e) => updateField('contacto', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  placeholder="Persona de contacto"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">CUIT</label>
                <input
                  type="text"
                  value={form.cuit}
                  onChange={(e) => updateField('cuit', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  placeholder="XX-XXXXXXXX-X"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">WhatsApp</label>
                <input
                  type="text"
                  value={form.whatsapp}
                  onChange={(e) => updateField('whatsapp', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  placeholder="+54 9 XXX XXX XXXX"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => updateField('email', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  placeholder="email@ejemplo.com"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Direccion</label>
                <input
                  type="text"
                  value={form.direccion}
                  onChange={(e) => updateField('direccion', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  placeholder="Direccion"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Notas</label>
              <textarea
                value={form.notas}
                onChange={(e) => updateField('notas', e.target.value)}
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                placeholder="Notas adicionales..."
              />
            </div>
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={cancelForm}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-5 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                {loading ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </form>
        </div>
      )}

      {proveedores.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-gray-400 text-sm">No hay proveedores registrados</p>
        </div>
      ) : (
        <div className="space-y-3">
          {proveedores.map((p) => (
            <div key={p.id} className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-gray-900">{p.nombre}</h3>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-sm text-gray-500">
                    {p.contacto && <span>Contacto: {p.contacto}</span>}
                    {p.cuit && <span>CUIT: {p.cuit}</span>}
                    {p.whatsapp && <span>WA: {p.whatsapp}</span>}
                    {p.email && <span>{p.email}</span>}
                    {p.direccion && <span>{p.direccion}</span>}
                  </div>
                  {p.notas && <p className="text-xs text-gray-400 mt-1">{p.notas}</p>}
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => startEdit(p)}
                    className="px-3 py-1.5 text-xs bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => handleDelete(p.id)}
                    disabled={loading}
                    className="px-3 py-1.5 text-xs bg-red-100 text-red-700 rounded-lg hover:bg-red-200 disabled:opacity-50 transition-colors"
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
