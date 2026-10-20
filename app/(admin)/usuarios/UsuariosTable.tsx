'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { FilaUsuario } from '@/lib/actions/usuarios'
import { crearUsuario, reinvitar, setActivo } from '@/lib/actions/usuarios'

function EstadoChip({ fila }: { fila: FilaUsuario }) {
  if (fila.invitacionPendiente) {
    return (
      <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
        Invitación pendiente
      </span>
    )
  }
  if (!fila.activo) {
    return (
      <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500 border border-gray-200">
        Inactivo
      </span>
    )
  }
  return (
    <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200">
      Activo
    </span>
  )
}

function FormNuevoUsuario() {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [enviando, startTransition] = useTransition()

  function cerrar() {
    setAbierto(false)
    setEmail('')
    setError(null)
  }

  function enviar(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const res = await crearUsuario(email)
      if (!res.ok) {
        setError(res.error)
        return
      }
      cerrar()
      router.refresh()
    })
  }

  if (!abierto) {
    return (
      <button
        onClick={() => setAbierto(true)}
        className="px-3 py-1.5 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700"
      >
        + Nuevo usuario
      </button>
    )
  }

  return (
    <form onSubmit={enviar} className="flex items-start gap-2">
      <div>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="nombre@gocuotas.com"
          required
          autoFocus
          className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-magenta-500"
        />
        {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
      </div>
      <button
        type="submit"
        disabled={enviando}
        className="px-3 py-1.5 bg-magenta-600 text-white text-sm font-medium rounded-lg hover:bg-magenta-700 disabled:opacity-50"
      >
        {enviando ? 'Invitando…' : 'Invitar'}
      </button>
      <button
        type="button"
        onClick={cerrar}
        disabled={enviando}
        className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700 disabled:opacity-50"
      >
        Cancelar
      </button>
    </form>
  )
}

type AccionFila = 'reinvitar' | 'toggle-activo'

// Confirmación en dos pasos, patrón de DemorasTable/siniestros: primer click
// cambia el botón a "¿Confirmar?", segundo ejecuta.
function AccionesFila({ fila }: { fila: FilaUsuario }) {
  const router = useRouter()
  const [pendiente, setPendiente] = useState<AccionFila | null>(null)
  const [enviando, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function ejecutar(accion: AccionFila) {
    startTransition(async () => {
      try {
        if (accion === 'reinvitar') {
          await reinvitar(fila.userId)
        } else {
          await setActivo(fila.userId, !fila.activo)
        }
        setPendiente(null)
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Error inesperado')
        setPendiente(null)
      }
    })
  }

  return (
    <div className="flex flex-col items-start gap-0.5">
      <div className="flex items-center gap-1.5 whitespace-nowrap">
        <Link href={`/usuarios/${fila.userId}`} className="text-indigo-700 hover:underline text-xs">
          Permisos
        </Link>

        {fila.invitacionPendiente && (
          pendiente === 'reinvitar' ? (
            <button
              disabled={enviando}
              onClick={() => ejecutar('reinvitar')}
              className="px-1.5 py-0.5 rounded text-[11px] font-bold text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-50"
            >
              {enviando ? '…' : '¿Confirmar?'}
            </button>
          ) : (
            <button
              disabled={enviando}
              onClick={() => { setPendiente('reinvitar'); setError(null) }}
              className="px-1.5 py-0.5 rounded border border-gray-300 text-[11px] text-gray-600 hover:bg-gray-100 disabled:opacity-40"
              title="Reenviar el mail de invitación"
            >
              Reinvitar
            </button>
          )
        )}

        {!fila.superAdmin && (
          pendiente === 'toggle-activo' ? (
            <button
              disabled={enviando}
              onClick={() => ejecutar('toggle-activo')}
              className={`px-1.5 py-0.5 rounded text-[11px] font-bold text-white disabled:opacity-50 ${
                fila.activo ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-900 hover:bg-gray-700'
              }`}
            >
              {enviando ? '…' : '¿Confirmar?'}
            </button>
          ) : (
            <button
              disabled={enviando}
              onClick={() => { setPendiente('toggle-activo'); setError(null) }}
              className="px-1.5 py-0.5 rounded border border-gray-300 text-[11px] text-gray-600 hover:bg-gray-100 disabled:opacity-40"
              title={fila.activo ? 'Desactivar: bloquea el login' : 'Reactivar: restaura el login'}
            >
              {fila.activo ? 'Desactivar' : 'Reactivar'}
            </button>
          )
        )}

        {pendiente && !enviando && (
          <button onClick={() => setPendiente(null)} className="text-[11px] text-gray-400 hover:text-gray-600 px-0.5" title="Cancelar">
            ✕
          </button>
        )}
      </div>
      {error && <span className="text-[10px] text-red-600 max-w-[220px]">{error}</span>}
    </div>
  )
}

export default function UsuariosTable({ usuarios }: { usuarios: FilaUsuario[] }) {
  return (
    <div>
      <div className="flex justify-end mb-4">
        <FormNuevoUsuario />
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-3 py-2 font-medium text-gray-600">Mail</th>
              <th className="text-left px-3 py-2 font-medium text-gray-600">Estado</th>
              <th className="text-left px-3 py-2 font-medium text-gray-600">Accesos</th>
              <th className="text-left px-3 py-2 font-medium text-gray-600">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {usuarios.map((fila) => (
              <tr key={fila.userId} className="hover:bg-gray-50">
                <td className="px-3 py-2 text-gray-900">{fila.email}</td>
                <td className="px-3 py-2"><EstadoChip fila={fila} /></td>
                <td className="px-3 py-2 text-gray-700">{fila.superAdmin ? 'Todo' : fila.resumen}</td>
                <td className="px-3 py-2"><AccionesFila fila={fila} /></td>
              </tr>
            ))}
            {usuarios.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-gray-400 text-sm">
                  No hay usuarios cargados todavía.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
