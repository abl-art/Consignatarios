'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatearMoneda } from '@/lib/utils'
import { editarModelo, eliminarModelo } from '@/lib/actions/modelos'
import type { Modelo } from '@/lib/types'

export default function ModeloRow({ modelo }: { modelo: Modelo }) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  // Local copy so we can update the displayed values optimistically after save
  // (router.refresh() doesn't always re-render fast enough in dev)
  const [current, setCurrent] = useState(modelo)
  const [form, setForm] = useState({
    marca: modelo.marca,
    modelo: modelo.modelo,
    precio_costo: String(modelo.precio_costo),
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setSaving(true)
    setError(null)
    const precio = parseFloat(form.precio_costo)
    if (!form.marca.trim() || !form.modelo.trim() || isNaN(precio) || precio < 0) {
      setError('Completá todos los campos correctamente')
      setSaving(false)
      return
    }
    const result = await editarModelo({
      id: current.id,
      marca: form.marca.trim(),
      modelo: form.modelo.trim(),
      precio_costo: precio,
    })
    setSaving(false)
    if ('error' in result && result.error) {
      setError(result.error)
      return
    }
    // Optimistic local update so the UI reflects the new values immediately
    setCurrent({
      ...current,
      marca: form.marca.trim(),
      modelo: form.modelo.trim(),
      precio_costo: precio,
    })
    setEditing(false)
    router.refresh()
  }

  function cancelar() {
    setForm({
      marca: current.marca,
      modelo: current.modelo,
      precio_costo: String(current.precio_costo),
    })
    setError(null)
    setEditing(false)
  }

  async function eliminar() {
    if (!confirm(`¿Eliminar ${current.marca} ${current.modelo}?`)) return
    await eliminarModelo(current.id)
    router.refresh()
  }

  if (editing) {
    return (
      <tr className="bg-magenta-50">
        <td className="px-6 py-3">
          <input
            value={form.marca}
            onChange={(e) => setForm({ ...form, marca: e.target.value })}
            className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
          />
        </td>
        <td className="px-6 py-3">
          <input
            value={form.modelo}
            onChange={(e) => setForm({ ...form, modelo: e.target.value })}
            className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
          />
        </td>
        <td className="px-6 py-3 text-right">
          <input
            type="number"
            step="0.01"
            min="0"
            value={form.precio_costo}
            onChange={(e) => setForm({ ...form, precio_costo: e.target.value })}
            className="w-32 px-2 py-1 border border-gray-300 rounded text-sm text-right"
          />
        </td>
        <td className="px-6 py-3 text-right">
          <div className="flex gap-2 justify-end items-center">
            {error && <span className="text-xs text-red-600">{error}</span>}
            <button onClick={cancelar} disabled={saving}
              className="px-2 py-1 text-xs border border-gray-300 rounded text-gray-600 hover:bg-gray-50">
              Cancelar
            </button>
            <button onClick={save} disabled={saving}
              className="px-2 py-1 text-xs bg-magenta-600 text-white rounded hover:bg-magenta-700 disabled:opacity-50">
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </td>
      </tr>
    )
  }

  return (
    <tr className="hover:bg-gray-50">
      <td className="px-6 py-3 text-gray-900">{current.marca}</td>
      <td className="px-6 py-3 text-gray-900">{current.modelo}</td>
      <td className="px-6 py-3 text-right text-gray-700">{formatearMoneda(current.precio_costo)}</td>
      <td className="px-6 py-3 text-right">
        <div className="flex gap-3 justify-end">
          <button onClick={() => setEditing(true)}
            className="text-magenta-600 hover:text-magenta-800" title="Editar">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4 12.5-12.5z" />
            </svg>
          </button>
          <button onClick={eliminar} className="text-red-500 hover:text-red-700 text-xs">
            Eliminar
          </button>
        </div>
      </td>
    </tr>
  )
}
