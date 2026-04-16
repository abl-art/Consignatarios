'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { editarConsignatario } from '@/lib/actions/consignatarios'
import type { Consignatario } from '@/lib/types'

export default function EditarForm({ consignatario }: { consignatario: Consignatario }) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [nombre, setNombre] = useState(consignatario.nombre)
  const [telefono, setTelefono] = useState(consignatario.telefono ?? '')
  const [comision, setComision] = useState(String(consignatario.comision_porcentaje))
  const [puntoReorden, setPuntoReorden] = useState(String(consignatario.punto_reorden))
  const [garantia, setGarantia] = useState(String(consignatario.garantia))

  function handleCancel() {
    setNombre(consignatario.nombre)
    setTelefono(consignatario.telefono ?? '')
    setComision(String(consignatario.comision_porcentaje))
    setPuntoReorden(String(consignatario.punto_reorden))
    setGarantia(String(consignatario.garantia))
    setError(null)
    setEditing(false)
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const result = await editarConsignatario({
        id: consignatario.id,
        nombre: nombre.trim(),
        telefono: telefono.trim() || null,
        comision_porcentaje: parseFloat(comision),
        punto_reorden: parseInt(puntoReorden, 10),
        garantia: parseFloat(garantia),
      })
      if ('error' in result && result.error) {
        setError(result.error)
      } else {
        setEditing(false)
        router.refresh()
      }
    } finally {
      setSaving(false)
    }
  }

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="px-3 py-1.5 text-sm font-medium rounded-lg bg-magenta-600 text-white hover:bg-magenta-700 transition-colors"
      >
        Editar
      </button>
    )
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
      <h2 className="font-semibold text-gray-900">Editar consignatario</h2>
      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
      )}
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className="block text-xs font-medium text-gray-600 mb-1">Nombre</label>
          <input
            type="text"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-magenta-500"
          />
        </div>
        <div className="col-span-2">
          <label className="block text-xs font-medium text-gray-600 mb-1">Teléfono</label>
          <input
            type="text"
            value={telefono}
            onChange={(e) => setTelefono(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-magenta-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Comisión (%)</label>
          <input
            type="number"
            min="0"
            max="100"
            step="0.01"
            value={comision}
            onChange={(e) => setComision(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-magenta-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Punto de reorden</label>
          <input
            type="number"
            min="0"
            step="1"
            value={puntoReorden}
            onChange={(e) => setPuntoReorden(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-magenta-500"
          />
        </div>
        <div className="col-span-2">
          <label className="block text-xs font-medium text-gray-600 mb-1">Garantía ($)</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={garantia}
            onChange={(e) => setGarantia(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-magenta-500"
          />
        </div>
      </div>
      <div className="flex gap-3 pt-1">
        <button
          onClick={handleCancel}
          disabled={saving}
          className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Cancelar
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 text-sm font-medium rounded-lg bg-magenta-600 text-white hover:bg-magenta-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? 'Guardando...' : 'Guardar'}
        </button>
      </div>
    </div>
  )
}
