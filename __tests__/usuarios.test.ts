import { test, expect } from 'vitest'
import { resumenAccesos, aplicarToggle, validarPermisos } from '@/lib/permisos'
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
