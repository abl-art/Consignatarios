import { describe, it, expect } from 'vitest'
import { planSyncGomarket, nombreSkuGomarket, type SkuGomarket, type ProductoGestorGomarket } from '@/lib/gomarket-catalogo'

const sku = (s: string, nombre: string, categoria: string | null = 'Electro', activo = true): SkuGomarket => ({
  sku: s,
  nombre,
  categoria,
  activo,
})

const prod = (id: string, codigo: string, nombre: string, categoria = 'Electro', oculto = false): ProductoGestorGomarket => ({
  id,
  codigo,
  nombre,
  categoria,
  oculto,
})

describe('planSyncGomarket', () => {
  it('crea los SKUs activos nuevos con su categoría y plataforma gomarket', () => {
    const plan = planSyncGomarket([sku('HEL-01', 'Heladera Gafa 300L')], [])
    expect(plan.nuevos).toEqual([{ codigo: 'HEL-01', nombre: 'Heladera Gafa 300L', categoria: 'Electro', plataforma: 'gomarket' }])
    expect(plan.actualizar).toEqual([])
    expect(plan.ocultar).toEqual([])
  })

  it('SKU sin categoría cae en la default GOmarket', () => {
    const plan = planSyncGomarket([sku('X', 'Producto', null)], [])
    expect(plan.nuevos[0].categoria).toBe('GOmarket')
  })

  it('actualiza nombre/categoría cambiados y reactiva ocultos que volvieron', () => {
    const plan = planSyncGomarket(
      [sku('A', 'Nombre nuevo'), sku('B', 'Igual'), sku('C', 'Volvió')],
      [prod('1', 'A', 'Nombre viejo'), prod('2', 'B', 'Igual'), prod('3', 'C', 'Volvió', 'Electro', true)],
    )
    expect(plan.actualizar).toEqual([
      { id: '1', nombre: 'Nombre nuevo', categoria: 'Electro', oculto: false },
      { id: '3', nombre: 'Volvió', categoria: 'Electro', oculto: false },
    ])
    expect(plan.nuevos).toEqual([])
  })

  it('oculta los que ya no están o quedaron inactivos en GOmarket (una sola vez)', () => {
    const plan = planSyncGomarket(
      [sku('INACTIVO', 'Baja', 'Electro', false)],
      [prod('1', 'INACTIVO', 'Baja'), prod('2', 'MANUAL-99', 'Alta manual sin SKU en GOmarket'), prod('3', 'YA-OCULTO', 'Viejo', 'Electro', true)],
    )
    expect(plan.ocultar).toEqual(['1', '2'])
    expect(plan.nuevos).toEqual([])
    expect(plan.actualizar).toEqual([])
  })
})

describe('nombreSkuGomarket', () => {
  it('agrega la variante cuando el nombre no la incluye', () => {
    expect(nombreSkuGomarket('Heladera Gafa', '300L Blanca')).toBe('Heladera Gafa 300L Blanca')
  })

  it('no duplica la variante si ya está en el nombre, ni agrega vacíos', () => {
    expect(nombreSkuGomarket('Heladera Gafa 300L', '300l')).toBe('Heladera Gafa 300L')
    expect(nombreSkuGomarket('Heladera Gafa', null)).toBe('Heladera Gafa')
    expect(nombreSkuGomarket('Heladera Gafa', '  ')).toBe('Heladera Gafa')
  })
})
