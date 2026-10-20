import { test, expect } from 'vitest'
import { resumenAccesos, aplicarToggle, validarPermisos, sanearPermisos, conRootImplicito } from '@/lib/permisos'
import type { Permisos } from '@/lib/permisos-catalogo'

test('resumenAccesos: sin permisos cargados', () => {
  expect(resumenAccesos({})).toBe('Sin accesos')
})

test('resumenAccesos: dos secciones, labels del catálogo, orden de CATALOGO, cuenta de subitems con nivel', () => {
  // compras aparece antes que finanzas en CATALOGO — el resumen debe respetar ese orden.
  const permisos: Permisos = {
    finanzas: {
      root: 'ver',
      flujo: 'ver',
      egresos: 'ver',
      deuda: 'ver',
      simulador: 'ver',
      precios: 'ver',
      resultado: 'ver',
    },
    compras: {
      root: 'ver',
      envios: 'ver',
    },
  }
  expect(resumenAccesos(permisos)).toBe('Compras (2) · Finanzas (7)')
})

test('resumenAccesos: una sola sección con un subitem', () => {
  const permisos: Permisos = { novedades: { root: 'ver' } }
  expect(resumenAccesos(permisos)).toBe('Novedades (1)')
})

// --- aplicarToggle -----------------------------------------------------

test('aplicarToggle: tildar operar sin nivel previo deja nivel operar (ver implícito)', () => {
  const resultado = aplicarToggle({}, 'finanzas', 'flujo', 'operar')
  expect(resultado.finanzas.flujo).toBe('operar')
})

test('aplicarToggle: destildar operar baja a ver', () => {
  const permisos: Permisos = { finanzas: { flujo: 'operar' } }
  const resultado = aplicarToggle(permisos, 'finanzas', 'flujo', 'operar')
  expect(resultado.finanzas.flujo).toBe('ver')
})

test('aplicarToggle: tildar ver sin nivel previo pone ver', () => {
  const resultado = aplicarToggle({}, 'finanzas', 'flujo', 'ver')
  expect(resultado.finanzas.flujo).toBe('ver')
})

test('aplicarToggle: destildar ver borra el subitem (conserva el resto de la sección)', () => {
  const permisos: Permisos = { finanzas: { flujo: 'ver', egresos: 'ver' } }
  const resultado = aplicarToggle(permisos, 'finanzas', 'flujo', 'ver')
  expect(resultado.finanzas.flujo).toBeUndefined()
  expect(resultado.finanzas.egresos).toBe('ver')
})

test('aplicarToggle: destildar ver del único subitem borra también la sección', () => {
  const permisos: Permisos = { finanzas: { flujo: 'ver' } }
  const resultado = aplicarToggle(permisos, 'finanzas', 'flujo', 'ver')
  expect(resultado.finanzas).toBeUndefined()
})

test('aplicarToggle: destildar ver con operar tildado borra igual (ver implica operar)', () => {
  const permisos: Permisos = { finanzas: { flujo: 'operar' } }
  const resultado = aplicarToggle(permisos, 'finanzas', 'flujo', 'ver')
  expect(resultado.finanzas).toBeUndefined()
})

test('aplicarToggle: es inmutable, no muta el objeto original', () => {
  const permisos: Permisos = { finanzas: { flujo: 'ver' } }
  aplicarToggle(permisos, 'finanzas', 'flujo', 'operar')
  expect(permisos.finanzas.flujo).toBe('ver')
})

// --- validarPermisos -----------------------------------------------------

test('validarPermisos: permisos vacíos son válidos', () => {
  expect(validarPermisos({})).toBeNull()
})

test('validarPermisos: permisos válidos devuelven null', () => {
  const permisos: Permisos = { finanzas: { root: 'ver', flujo: 'operar' } }
  expect(validarPermisos(permisos)).toBeNull()
})

test('validarPermisos: rechaza sección desconocida', () => {
  const permisos = { 'seccion-inexistente': { root: 'ver' } } as unknown as Permisos
  expect(validarPermisos(permisos)).not.toBeNull()
})

test('validarPermisos: rechaza subitem desconocido', () => {
  const permisos: Permisos = { finanzas: { 'subitem-inexistente': 'ver' } }
  expect(validarPermisos(permisos)).not.toBeNull()
})

test('validarPermisos: rechaza operar en subitem con operar:false', () => {
  const permisos: Permisos = { finanzas: { indicadores: 'operar' } }
  expect(validarPermisos(permisos)).not.toBeNull()
})

// --- sanearPermisos -----------------------------------------------------
// Limpia lo leído de la DB (fila `permisos`) antes de que el editor lo
// cargue: si el catálogo cambió (rename/baja de sección o subitem) después
// de que un usuario quedó con ese tilde guardado, el editor no debe
// arrancar con basura que después haga fallar validarPermisos en
// guardarPermisos sin que el super admin haya tocado nada.

test('sanearPermisos: elimina una sección desconocida para el catálogo', () => {
  const permisos = {
    'seccion-inexistente': { root: 'ver' },
    finanzas: { root: 'ver' },
  } as unknown as Permisos
  expect(sanearPermisos(permisos)).toEqual({ finanzas: { root: 'ver' } })
})

test('sanearPermisos: elimina un subitem desconocido, conserva los válidos de la misma sección', () => {
  const permisos = {
    finanzas: { root: 'ver', 'subitem-inexistente': 'ver', flujo: 'operar' },
  } as unknown as Permisos
  expect(sanearPermisos(permisos)).toEqual({ finanzas: { root: 'ver', flujo: 'operar' } })
})

test('sanearPermisos: baja a ver un operar sobre subitem con operar:false', () => {
  const permisos: Permisos = { finanzas: { indicadores: 'operar' } }
  expect(sanearPermisos(permisos)).toEqual({ finanzas: { indicadores: 'ver' } })
})

test('sanearPermisos: permisos ya válidos pasan intactos', () => {
  const permisos: Permisos = { finanzas: { root: 'ver', flujo: 'operar' }, compras: { root: 'ver' } }
  expect(sanearPermisos(permisos)).toEqual(permisos)
})

test('sanearPermisos: permisos vacíos quedan vacíos', () => {
  expect(sanearPermisos({})).toEqual({})
})

test('sanearPermisos: una sección que queda sin subitems válidos se elimina entera', () => {
  const permisos = {
    finanzas: { 'subitem-inexistente': 'ver' },
    compras: { root: 'ver' },
  } as unknown as Permisos
  expect(sanearPermisos(permisos)).toEqual({ compras: { root: 'ver' } })
})

test('sanearPermisos: el resultado de sanearPermisos siempre pasa validarPermisos', () => {
  const permisos = {
    'seccion-inexistente': { root: 'ver' },
    finanzas: { root: 'ver', 'subitem-inexistente': 'operar', indicadores: 'operar' },
  } as unknown as Permisos
  expect(validarPermisos(sanearPermisos(permisos))).toBeNull()
})

// --- conRootImplicito -----------------------------------------------------
// Secciones tipo tab (p.ej. Finanzas) sin el ROOT tildado quedan inaccesibles
// aunque el sidebar las muestre (filtrarNavItems mira el ROOT para decidir
// si la sección aparece). El editor llama a esto tras aplicarToggle cuando
// el toggle tildó algo, para que tildar un subitem también deje la sección
// navegable.

test('conRootImplicito: auto-tilda el root en ver cuando se tilda un subitem y el root no está tildado', () => {
  const permisos: Permisos = { finanzas: { flujo: 'ver' } }
  const resultado = conRootImplicito(permisos, 'finanzas')
  expect(resultado.finanzas.root).toBe('ver')
  expect(resultado.finanzas.flujo).toBe('ver')
})

test('conRootImplicito: no toca el root si ya está tildado (ni le baja el nivel)', () => {
  const permisos: Permisos = { finanzas: { root: 'operar', flujo: 'ver' } }
  const resultado = conRootImplicito(permisos, 'finanzas')
  expect(resultado.finanzas.root).toBe('operar')
})

test('conRootImplicito: sección sin entrada en permisos no rompe y no agrega nada', () => {
  expect(conRootImplicito({}, 'finanzas')).toEqual({})
})

test('conRootImplicito: sección desconocida en el catálogo devuelve permisos sin cambios', () => {
  const permisos = { 'seccion-inexistente': { flujo: 'ver' } } as unknown as Permisos
  expect(conRootImplicito(permisos, 'seccion-inexistente')).toEqual(permisos)
})

test('conRootImplicito: es inmutable, no muta el objeto original', () => {
  const permisos: Permisos = { finanzas: { flujo: 'ver' } }
  conRootImplicito(permisos, 'finanzas')
  expect(permisos.finanzas.root).toBeUndefined()
})
