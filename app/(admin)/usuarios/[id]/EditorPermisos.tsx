'use client'

// Editor de permisos Ver/Operar por usuario (Task 9). Secciones colapsables
// (<details>), contador + enlaces "todo/nada" por sección, y guardado
// explícito (sin autosave) con feedback de estado. aplicarToggle (lib/permisos)
// es la MISMA función pura que valida los tests — esta pantalla es solo UI
// encima de ella; guardarPermisos revalida server-side antes de persistir.

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CATALOGO, type NivelPermiso, type Permisos, type SeccionCatalogo } from '@/lib/permisos-catalogo'
import { aplicarToggle, conRootImplicito } from '@/lib/permisos'
import { guardarPermisos } from '@/lib/actions/usuarios'

type EstadoGuardado = 'idle' | 'guardado' | 'error'

// Serialización canónica (orden fijo de CATALOGO) para comparar "cambios sin
// guardar" sin depender del orden de claves de los objetos — evita falsos
// positivos entre el estado local y el que vino del server.
function huella(permisos: Permisos): string {
  return CATALOGO.flatMap((seccion) =>
    seccion.subitems.map((subitem) => `${seccion.id}.${subitem.id}=${permisos[seccion.id]?.[subitem.id] ?? ''}`)
  ).join('|')
}

function contarHabilitados(permisos: Permisos, seccion: SeccionCatalogo): number {
  const subitems = permisos[seccion.id]
  if (!subitems) return 0
  return seccion.subitems.filter((subitem) => subitems[subitem.id] === 'ver' || subitems[subitem.id] === 'operar').length
}

// "todo" = Ver en todos los subitems de la sección (NO Operar).
function todaLaSeccion(permisos: Permisos, seccion: SeccionCatalogo): Permisos {
  const nuevaSeccion: Record<string, NivelPermiso> = {}
  for (const subitem of seccion.subitems) nuevaSeccion[subitem.id] = 'ver'
  return { ...permisos, [seccion.id]: nuevaSeccion }
}

// "nada" = quita la sección completa.
function ningunaSeccion(permisos: Permisos, seccionId: string): Permisos {
  const copia = { ...permisos }
  delete copia[seccionId]
  return copia
}

export default function EditorPermisos({
  userId,
  permisosIniciales,
}: {
  userId: string
  permisosIniciales: Permisos
}) {
  const router = useRouter()
  const [permisos, setPermisos] = useState<Permisos>(permisosIniciales)
  const [estado, setEstado] = useState<EstadoGuardado>('idle')
  const [error, setError] = useState<string | null>(null)
  const [guardando, startTransition] = useTransition()

  const hayCambios = useMemo(
    () => huella(permisos) !== huella(permisosIniciales),
    [permisos, permisosIniciales]
  )

  function toggle(seccionId: string, subitemId: string, campo: 'ver' | 'operar') {
    setPermisos((actual) => {
      const siguiente = aplicarToggle(actual, seccionId, subitemId, campo)
      const nivelResultante = siguiente[seccionId]?.[subitemId]
      const quedoTildado = nivelResultante === 'ver' || nivelResultante === 'operar'
      // Solo auto-tildamos el ROOT cuando el toggle activó algo — si lo que
      // se destildó fue el ROOT mismo, eso es decisión explícita del super
      // admin y no lo revivimos.
      return quedoTildado ? conRootImplicito(siguiente, seccionId) : siguiente
    })
    setEstado('idle')
    setError(null)
  }

  function guardar() {
    setError(null)
    startTransition(async () => {
      try {
        await guardarPermisos(userId, permisos)
        setEstado('guardado')
        router.refresh()
      } catch (e) {
        setEstado('error')
        setError(e instanceof Error ? e.message : 'Error inesperado')
      }
    })
  }

  return (
    <div className="pb-24">
      <div className="space-y-3">
        {CATALOGO.map((seccion) => {
          const cantidad = contarHabilitados(permisos, seccion)
          return (
            <details key={seccion.id} className="border border-gray-200 rounded-lg overflow-hidden" open={cantidad > 0}>
              <summary className="flex items-center justify-between gap-3 px-4 py-2.5 bg-gray-50 cursor-pointer select-none list-none">
                <span className="font-medium text-gray-900">{seccion.label}</span>
                <span className="flex items-center gap-3 text-sm whitespace-nowrap">
                  <span className={cantidad > 0 ? 'text-indigo-700' : 'text-gray-400'}>
                    {cantidad > 0
                      ? `${cantidad} subitem${cantidad === 1 ? '' : 's'} habilitado${cantidad === 1 ? '' : 's'}`
                      : 'Sin acceso'}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault()
                      setPermisos((actual) => todaLaSeccion(actual, seccion))
                      setEstado('idle')
                    }}
                    className="text-indigo-700 hover:underline text-xs"
                  >
                    todo
                  </button>
                  <span className="text-gray-300">·</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault()
                      setPermisos((actual) => ningunaSeccion(actual, seccion.id))
                      setEstado('idle')
                    }}
                    className="text-indigo-700 hover:underline text-xs"
                  >
                    nada
                  </button>
                </span>
              </summary>

              <table className="w-full text-sm border-t border-gray-100">
                <thead>
                  <tr className="text-gray-500 text-xs">
                    <th className="text-left px-4 py-1.5 font-medium">{seccion.external ? 'Acceso' : 'Pestaña'}</th>
                    <th className="w-16 text-center font-medium">Ver</th>
                    <th className="w-16 text-center font-medium">Operar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {seccion.subitems.map((subitem) => {
                    const nivel = permisos[seccion.id]?.[subitem.id]
                    return (
                      <tr key={subitem.id}>
                        <td className="px-4 py-1.5 text-gray-700">{subitem.label}</td>
                        <td className="text-center">
                          <input
                            type="checkbox"
                            checked={nivel === 'ver' || nivel === 'operar'}
                            onChange={() => toggle(seccion.id, subitem.id, 'ver')}
                            aria-label={`Ver ${subitem.label}`}
                          />
                        </td>
                        <td className="text-center">
                          <input
                            type="checkbox"
                            checked={nivel === 'operar'}
                            disabled={!subitem.operar}
                            onChange={() => toggle(seccion.id, subitem.id, 'operar')}
                            aria-label={`Operar ${subitem.label}`}
                          />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </details>
          )
        })}
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-6 py-3 flex items-center gap-3 z-20">
        <button
          type="button"
          onClick={guardar}
          disabled={guardando}
          className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 disabled:opacity-50"
        >
          {guardando ? 'Guardando…' : 'Guardar cambios'}
        </button>

        {guardando && <span className="text-xs text-gray-400">Guardando…</span>}
        {!guardando && hayCambios && <span className="text-xs text-amber-600">Hay cambios sin guardar</span>}
        {!guardando && !hayCambios && estado === 'guardado' && (
          <span className="text-xs text-green-600">Guardado</span>
        )}
        {!guardando && estado === 'error' && error && <span className="text-xs text-red-600">{error}</span>}
      </div>
    </div>
  )
}
