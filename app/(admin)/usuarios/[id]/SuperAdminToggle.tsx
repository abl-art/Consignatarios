'use client'

// Tilde de super admin en la ficha de un usuario (spec: "sumar otro super
// admin a futuro = tildar el flag desde el panel"). Confirmación en dos
// pasos, mismo patrón que AccionesFila en UsuariosTable: primer click pide
// confirmar, segundo ejecuta. Vive SOLO en la ficha (no en la tabla de
// /usuarios) porque es una acción sensible — acceso total + gestión de
// usuarios — que merece su propio espacio, no un tilde más en una fila.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { setSuperAdmin } from '@/lib/actions/usuarios'

export default function SuperAdminToggle({
  userId,
  superAdmin,
}: {
  userId: string
  superAdmin: boolean
}) {
  const router = useRouter()
  const [confirmando, setConfirmando] = useState(false)
  const [enviando, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function ejecutar() {
    startTransition(async () => {
      try {
        await setSuperAdmin(userId, !superAdmin)
        setConfirmando(false)
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Error inesperado')
        setConfirmando(false)
      }
    })
  }

  return (
    <div className="mb-6 p-4 border border-gray-200 rounded-lg bg-gray-50">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-sm font-medium text-gray-900">
            Super admin (acceso total y gestión de usuarios)
          </p>
          <p className="text-xs text-gray-500 max-w-md">
            {superAdmin
              ? 'Este usuario es super admin: entra a todo el panel y puede gestionar usuarios desde /usuarios, sin importar los tildes de abajo.'
              : 'Activarlo le da acceso total al panel y le permite gestionar usuarios — equivalente a sumarlo como super admin.'}
          </p>
        </div>

        {confirmando ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={enviando}
              onClick={ejecutar}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold text-white disabled:opacity-50 whitespace-nowrap ${
                superAdmin ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-900 hover:bg-gray-700'
              }`}
            >
              {enviando ? '…' : '¿Confirmar?'}
            </button>
            <button
              type="button"
              onClick={() => setConfirmando(false)}
              disabled={enviando}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              Cancelar
            </button>
          </div>
        ) : (
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer whitespace-nowrap">
            <input
              type="checkbox"
              checked={superAdmin}
              onChange={() => {
                setConfirmando(true)
                setError(null)
              }}
            />
            Super admin
          </label>
        )}
      </div>
      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
    </div>
  )
}
