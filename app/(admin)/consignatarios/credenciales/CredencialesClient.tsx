'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { guardarCredencial } from './actions'

interface Credencial {
  id: string
  nombre: string
  email: string
  password: string
}

export default function CredencialesClient({ credenciales }: { credenciales: Credencial[] }) {
  const router = useRouter()
  const [editing, setEditing] = useState<string | null>(null)
  const [newPass, setNewPass] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPasswords, setShowPasswords] = useState(false)

  async function handleSave(id: string) {
    if (!newPass.trim()) return
    setLoading(true)
    await guardarCredencial(id, newPass.trim())
    setLoading(false)
    setEditing(null)
    setNewPass('')
    router.refresh()
  }

  return (
    <div>
      <div className="flex justify-end mb-4">
        <button
          onClick={() => setShowPasswords(!showPasswords)}
          className="px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          {showPasswords ? 'Ocultar contraseñas' : 'Mostrar contraseñas'}
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-5 py-3 font-medium text-gray-600">Consignatario</th>
              <th className="text-left px-5 py-3 font-medium text-gray-600">Email</th>
              <th className="text-left px-5 py-3 font-medium text-gray-600">Contraseña</th>
              <th className="text-center px-5 py-3 font-medium text-gray-600 w-24">Acción</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {credenciales.map(c => (
              <tr key={c.id} className="hover:bg-gray-50">
                <td className="px-5 py-3 font-medium text-gray-900">{c.nombre}</td>
                <td className="px-5 py-3 text-gray-600">{c.email}</td>
                <td className="px-5 py-3">
                  {editing === c.id ? (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newPass}
                        onChange={(e) => setNewPass(e.target.value)}
                        placeholder="Nueva contraseña"
                        className="px-2 py-1 border border-gray-300 rounded text-sm w-40"
                        autoFocus
                        onKeyDown={(e) => e.key === 'Enter' && handleSave(c.id)}
                      />
                      <button onClick={() => handleSave(c.id)} disabled={loading} className="px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50">
                        {loading ? '...' : 'OK'}
                      </button>
                      <button onClick={() => { setEditing(null); setNewPass('') }} className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700">
                        ✕
                      </button>
                    </div>
                  ) : (
                    <span className={`font-mono text-xs ${c.password ? 'text-gray-700' : 'text-gray-300'}`}>
                      {c.password ? (showPasswords ? c.password : '••••••••') : 'Sin configurar'}
                    </span>
                  )}
                </td>
                <td className="px-5 py-3 text-center">
                  <button
                    onClick={() => { setEditing(c.id); setNewPass(c.password) }}
                    className="px-3 py-1 text-xs bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    {c.password ? 'Cambiar' : 'Configurar'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
