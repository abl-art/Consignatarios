import { test, expect } from 'vitest'
import { resumenAccesos } from '@/lib/permisos'
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
