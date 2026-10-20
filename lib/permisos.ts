// Lógica pura de permisos Ver/Operar: sin I/O, sin APIs de Node — la
// importan tanto el middleware (edge) como el sidebar y los editores de
// permisos. "Operar" implica "Ver"; toda ruta no catalogada se niega por
// default (default deny).

import { CATALOGO, SUBITEM_ROOT, type NivelPermiso, type Permisos, type SeccionCatalogo } from './permisos-catalogo'

export const DOMINIOS_PERMITIDOS = ['gocuotas.com']

export function emailPermitido(email: string, dominios: string[] = DOMINIOS_PERMITIDOS): boolean {
  const dominio = email.trim().toLowerCase().split('@').pop() ?? ''
  return dominios.some((d) => d.toLowerCase() === dominio)
}

export function puedeVer(permisos: Permisos, seccion: string, subitem: string = SUBITEM_ROOT): boolean {
  const nivel = permisos[seccion]?.[subitem]
  return nivel === 'ver' || nivel === 'operar'
}

export function puedeOperar(permisos: Permisos, seccion: string, subitem: string = SUBITEM_ROOT): boolean {
  return permisos[seccion]?.[subitem] === 'operar'
}

// Ruta "efectiva" de un subitem para matchear pathnames: su propio `ruta`
// o, si es el ROOT y no tiene `ruta` propio, el `href` de la sección.
function rutaEfectiva(seccion: SeccionCatalogo, subitem: { id: string; ruta?: string }): string | undefined {
  if (subitem.ruta) return subitem.ruta
  if (subitem.id === SUBITEM_ROOT) return seccion.href
  return undefined
}

function matchea(ruta: string, pathname: string): boolean {
  return pathname === ruta || pathname.startsWith(ruta + '/')
}

type MatchRuta = { seccion: SeccionCatalogo; subitemId: string; ruta: string }

function encontrarMatch(pathname: string): MatchRuta | null {
  let mejor: MatchRuta | null = null
  for (const seccion of CATALOGO) {
    for (const subitem of seccion.subitems) {
      const ruta = rutaEfectiva(seccion, subitem)
      if (!ruta || !matchea(ruta, pathname)) continue
      if (!mejor || ruta.length > mejor.ruta.length) {
        mejor = { seccion, subitemId: subitem.id, ruta }
      }
    }
  }
  return mejor
}

export function rutaPermitida(permisos: Permisos, pathname: string): boolean {
  const match = encontrarMatch(pathname)
  if (!match) return false
  return puedeVer(permisos, match.seccion.id, match.subitemId)
}

export function primeraRutaPermitida(permisos: Permisos): string | null {
  for (const seccion of CATALOGO) {
    if (seccion.external) continue
    for (const subitem of seccion.subitems) {
      const ruta = rutaEfectiva(seccion, subitem)
      if (!ruta) continue
      if (puedeVer(permisos, seccion.id, subitem.id)) return ruta
    }
  }
  return null
}

export function filtrarNavItems(permisos: Permisos): SeccionCatalogo[] {
  return CATALOGO.filter((seccion) => seccion.subitems.some((subitem) => puedeVer(permisos, seccion.id, subitem.id)))
}

export function tabsPermitidas(permisos: Permisos, seccion: string, tabIds: string[]): string[] {
  return tabIds.filter((id) => puedeVer(permisos, seccion, id))
}

// Resumen legible de accesos para el panel /usuarios (p.ej. "Finanzas (7) ·
// Compras (2)"). Pura: solo mira `permisos`, en el orden de CATALOGO; el caso
// super admin ("Todo") lo decide la UI con el flag `superAdmin`, no esta
// función.
export function resumenAccesos(permisos: Permisos): string {
  const partes = CATALOGO
    .map((seccion) => {
      const cantidad = seccion.subitems.filter((subitem) => puedeVer(permisos, seccion.id, subitem.id)).length
      return cantidad > 0 ? `${seccion.label} (${cantidad})` : null
    })
    .filter((parte): parte is string => parte !== null)

  return partes.length > 0 ? partes.join(' · ') : 'Sin accesos'
}

// Clon profundo a un nivel (seccion -> subitems): aplicarToggle/validarPermisos
// nunca mutan el objeto que reciben — lo usa el editor de permisos (Task 9)
// para comparar "cambios sin guardar" contra el estado original con ===.
function clonarPermisos(permisos: Permisos): Permisos {
  const copia: Permisos = {}
  for (const [seccionId, subitems] of Object.entries(permisos)) {
    copia[seccionId] = { ...subitems }
  }
  return copia
}

/**
 * Aplica un toggle de checkbox (Ver u Operar) sobre un subitem, de forma
 * inmutable (devuelve una copia nueva). Semántica (ver pins de Task 9):
 * - Tildar Operar ⇒ nivel 'operar' (Ver queda implícito).
 * - Destildar Operar (nivel era 'operar') ⇒ baja a 'ver'.
 * - Tildar Ver (sin nivel previo) ⇒ nivel 'ver'.
 * - Destildar Ver (nivel era 'ver' u 'operar') ⇒ borra el subitem; si la
 *   sección queda sin subitems, también se borra la sección entera.
 */
export function aplicarToggle(
  permisos: Permisos,
  seccion: string,
  subitem: string,
  campo: 'ver' | 'operar'
): Permisos {
  const copia = clonarPermisos(permisos)
  const nivelActual = copia[seccion]?.[subitem]

  if (campo === 'operar') {
    const nuevoNivel: NivelPermiso = nivelActual === 'operar' ? 'ver' : 'operar'
    copia[seccion] = { ...(copia[seccion] ?? {}), [subitem]: nuevoNivel }
    return copia
  }

  // campo === 'ver'
  if (nivelActual === 'ver' || nivelActual === 'operar') {
    const resto = { ...copia[seccion] }
    delete resto[subitem]
    if (Object.keys(resto).length === 0) {
      delete copia[seccion]
    } else {
      copia[seccion] = resto
    }
    return copia
  }

  copia[seccion] = { ...(copia[seccion] ?? {}), [subitem]: 'ver' }
  return copia
}

/**
 * Valida un objeto Permisos contra CATALOGO. null = válido. Usada por
 * guardarPermisos (lib/actions/usuarios.ts) como guard server-side — nunca
 * confiar solo en que la UI no deje armar un estado inválido.
 */
export function validarPermisos(permisos: Permisos): string | null {
  for (const [seccionId, subitems] of Object.entries(permisos)) {
    const seccionCatalogo = CATALOGO.find((s) => s.id === seccionId)
    if (!seccionCatalogo) return `Sección desconocida: "${seccionId}"`

    for (const [subitemId, nivel] of Object.entries(subitems)) {
      const subitemCatalogo = seccionCatalogo.subitems.find((s) => s.id === subitemId)
      if (!subitemCatalogo) return `Subitem desconocido: "${seccionId}.${subitemId}"`

      if (nivel !== 'ver' && nivel !== 'operar') {
        return `Nivel de permiso inválido en "${seccionId}.${subitemId}"`
      }

      if (nivel === 'operar' && !subitemCatalogo.operar) {
        return `"${seccionCatalogo.label} > ${subitemCatalogo.label}" no admite nivel Operar`
      }
    }
  }

  return null
}

/**
 * Limpia un objeto Permisos leído de la DB contra CATALOGO: elimina
 * secciones y subitems que ya no existen (rename/baja de un ítem del
 * catálogo) y niveles inválidos, y baja a 'ver' un 'operar' guardado sobre
 * un subitem que ahora es `operar: false`. Pura e inmutable (no toca el
 * objeto recibido).
 *
 * La usa getUsuario (lib/actions/usuarios.ts) sobre lo leído de la DB antes
 * de devolverlo al editor: así la ficha arranca siempre en un estado que
 * valida limpio, y el próximo guardado persiste la versión saneada — sin
 * esto, un super admin que abre la ficha de alguien con basura vieja en
 * `permisos` quedaría trabado: guardarPermisos exige validarPermisos
 * estricto y rechazaría CUALQUIER guardado, incluso de algo que no tocó.
 */
export function sanearPermisos(permisos: Permisos): Permisos {
  const resultado: Permisos = {}

  for (const [seccionId, subitems] of Object.entries(permisos)) {
    const seccionCatalogo = CATALOGO.find((s) => s.id === seccionId)
    if (!seccionCatalogo) continue

    const subitemsValidos: Record<string, NivelPermiso> = {}
    for (const [subitemId, nivel] of Object.entries(subitems)) {
      const subitemCatalogo = seccionCatalogo.subitems.find((s) => s.id === subitemId)
      if (!subitemCatalogo) continue
      if (nivel !== 'ver' && nivel !== 'operar') continue

      subitemsValidos[subitemId] = nivel === 'operar' && !subitemCatalogo.operar ? 'ver' : nivel
    }

    if (Object.keys(subitemsValidos).length > 0) {
      resultado[seccionId] = subitemsValidos
    }
  }

  return resultado
}
