import { test, expect } from 'vitest'
import {
  emailPermitido,
  puedeVer,
  puedeOperar,
  rutaPermitida,
  primeraRutaPermitida,
  filtrarNavItems,
  tabsPermitidas,
} from '@/lib/permisos'
import { SUBITEM_ROOT } from '@/lib/permisos-catalogo'

test('emailPermitido acepta gocuotas.com con mayúsculas y espacios', () => {
  expect(emailPermitido(' Maria.Perez@GOcuotas.COM ')).toBe(true)
  expect(emailPermitido('alguien@gmail.com')).toBe(false)
  expect(emailPermitido('x@gocuotas.com.ar')).toBe(false)
})

test('emailPermitido respeta lista de dominios custom', () => {
  expect(emailPermitido('alguien@partner.com', ['partner.com'])).toBe(true)
  expect(emailPermitido('alguien@gocuotas.com', ['partner.com'])).toBe(false)
})

test('operar implica ver', () => {
  const p = { finanzas: { flujo: 'operar' as const } }
  expect(puedeVer(p, 'finanzas', 'flujo')).toBe(true)
  expect(puedeOperar(p, 'finanzas', 'flujo')).toBe(true)
  expect(puedeOperar({ finanzas: { flujo: 'ver' as const } }, 'finanzas', 'flujo')).toBe(false)
})

test('puedeVer/puedeOperar usan SUBITEM_ROOT por default', () => {
  const p = { compras: { [SUBITEM_ROOT]: 'ver' as const } }
  expect(puedeVer(p, 'compras')).toBe(true)
  expect(puedeOperar(p, 'compras')).toBe(false)
  expect(puedeVer(p, 'inventario')).toBe(false)
})

test('rutaPermitida: subruta de hub, default deny en no catalogada', () => {
  const p = { compras: { root: 'ver' as const, envios: 'ver' as const } }
  expect(rutaPermitida(p, '/compras/envios')).toBe(true)
  expect(rutaPermitida(p, '/compras/forecast')).toBe(false)
  expect(rutaPermitida(p, '/ruta-inventada')).toBe(false)
})

test('rutaPermitida: match exacto del hub por igualdad de pathname', () => {
  const p = { compras: { root: 'ver' as const } }
  expect(rutaPermitida(p, '/compras')).toBe(true)
  expect(rutaPermitida({}, '/compras')).toBe(false)
})

test('rutaPermitida: prefijo más largo gana en el quirk de mayoristas', () => {
  // canales.href = /canales, pero mayoristas vive bajo /mayoristas/* con
  // su propio hub en /canales/mayoristas. Dar ver solo a canales no debe
  // habilitar /mayoristas/clientes (sección distinta, prefijo más específico).
  const p = { canales: { root: 'ver' as const } }
  expect(rutaPermitida(p, '/canales/tienda')).toBe(false)
  expect(rutaPermitida(p, '/mayoristas/clientes')).toBe(false)

  const q = { mayoristas: { root: 'ver' as const, clientes: 'ver' as const } }
  expect(rutaPermitida(q, '/canales/mayoristas')).toBe(true)
  expect(rutaPermitida(q, '/mayoristas/clientes')).toBe(true)
  expect(rutaPermitida(q, '/mayoristas/proformas')).toBe(false)
})

test('permisos vacíos: primeraRutaPermitida null, nav vacío', () => {
  expect(primeraRutaPermitida({})).toBeNull()
  expect(filtrarNavItems({})).toEqual([])
})

test('primeraRutaPermitida nunca devuelve una sección external y respeta orden de CATALOGO', () => {
  const p = {
    'centro-operaciones': { root: 'ver' as const }, // external, debe ignorarse
    dashboard: { root: 'ver' as const },
    celia: { root: 'ver' as const },
  }
  // dashboard viene antes que celia en CATALOGO
  expect(primeraRutaPermitida(p)).toBe('/dashboard')
})

test('filtrarNavItems incluye solo secciones con algún subitem visible', () => {
  const p = { compras: { envios: 'ver' as const }, inventario: {} }
  const items = filtrarNavItems(p)
  expect(items.map((s) => s.id)).toEqual(['compras'])
})

test('tabsPermitidas filtra y conserva orden', () => {
  const p = { finanzas: { flujo: 'operar' as const, resultado: 'ver' as const } }
  expect(tabsPermitidas(p, 'finanzas', ['flujo', 'egresos', 'resultado'])).toEqual(['flujo', 'resultado'])
})

test('tabsPermitidas sin permisos devuelve vacío', () => {
  expect(tabsPermitidas({}, 'finanzas', ['flujo', 'egresos'])).toEqual([])
})
