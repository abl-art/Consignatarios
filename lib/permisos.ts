// Lógica pura de permisos Ver/Operar: sin I/O, sin APIs de Node — la
// importan tanto el middleware (edge) como el sidebar y los editores de
// permisos. "Operar" implica "Ver"; toda ruta no catalogada se niega por
// default (default deny).

import { CATALOGO, SUBITEM_ROOT, type Permisos, type SeccionCatalogo } from './permisos-catalogo'

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
