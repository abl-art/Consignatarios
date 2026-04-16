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
  const [email, setEmail] = useState(consignatario.email)
  const [telefono, setTelefono] = useState(consignatario.telefono ?? '')
  const [newPassword, setNewPassword] = useState('')
  const [comision, setComision] = useState(String(consignatario.comision_porcentaje))
  const [puntoReorden, setPuntoReorden] = useState(String(consignatario.punto_reorden))
  const [garantia, setGarantia] = useState(String(consignatario.garantia))
  const [storePrefix, setStorePrefix] = useState(consignatario.store_prefix ?? '')

  function handleCancel() {
    setNombre(consignatario.nombre)
    setEmail(consignatario.email)
    setTelefono(consignatario.telefono ?? '')
    setNewPassword('')
    setComision(String(consignatario.comision_porcentaje))
    setPuntoReorden(String(consignatario.punto_reorden))
    setGarantia(String(consignatario.garantia))
    setStorePrefix(consignatario.store_prefix ?? '')
    setError(null)
    setEditing(false)
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const trimmedPwd = newPassword.trim()
      if (trimmedPwd && trimmedPwd.length < 6) {
        setError('La contraseña debe tener al menos 6 caracteres')
        setSaving(false)
        return
      }
      const result = await editarConsignatario({
        id: consignatario.id,
        user_id: consignatario.user_id,
        nombre: nombre.trim(),
        email: email.trim(),
        telefono: telefono.trim() || null,
        comision_porcentaje: parseFloat(comision),
        punto_reorden: parseInt(puntoReorden, 10),
        garantia: parseFloat(garantia),
        store_prefix: storePrefix.trim() || null,
        newPassword: trimmedPwd || undefined,
      })
      if ('error' in result && result.error) {
        setError(result.error)
      } else {
        setEditing(false)
        setNewPassword('')
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

  const inputCls = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-magenta-500'
  const labelCls = 'block text-xs font-medium text-gray-600 mb-1'

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4 w-full max-w-3xl">
      <h2 className="font-semibold text-gray-900">Editar consignatario</h2>
      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
      )}

      <div className="grid grid-cols-2 gap-4">
        {/* Fila 1 */}
        <div>
          <label className={labelCls}>Nombre</label>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
        </div>

        {/* Fila 2 */}
        <div>
          <label className={labelCls}>Teléfono</label>
          <input value={telefono} onChange={(e) => setTelefono(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Nueva contraseña <span className="text-gray-400 font-normal">(opcional)</span></label>
          <input type="text" value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Dejá vacío para no cambiar" className={`${inputCls} font-mono`} />
        </div>

        {/* Fila 3 */}
        <div>
          <label className={labelCls}>Comisión (%)</label>
          <input type="number" min="0" max="100" step="0.01"
            value={comision} onChange={(e) => setComision(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Punto de reorden</label>
          <input type="number" min="0" step="1"
            value={puntoReorden} onChange={(e) => setPuntoReorden(e.target.value)} className={inputCls} />
        </div>

        {/* Fila 4 */}
        <div>
          <label className={labelCls}>Garantía ($)</label>
          <input type="number" min="0" step="0.01"
            value={garantia} onChange={(e) => setGarantia(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Prefijo sucursal</label>
          <input value={storePrefix} onChange={(e) => setStorePrefix(e.target.value)}
            placeholder="Ej: RIIIN" className={inputCls} />
        </div>
      </div>

      <div className="flex gap-3 pt-1 justify-end">
        <button onClick={handleCancel} disabled={saving}
          className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors">
          Cancelar
        </button>
        <button onClick={handleSave} disabled={saving}
          className="px-4 py-2 text-sm font-medium rounded-lg bg-magenta-600 text-white hover:bg-magenta-700 disabled:opacity-50 transition-colors">
          {saving ? 'Guardando...' : 'Guardar'}
        </button>
      </div>
    </div>
  )
}
