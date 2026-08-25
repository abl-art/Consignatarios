import { describe, it, expect } from 'vitest'
import { buscarModelos, type ModeloCatalogo } from '@/lib/catalogo-buscador'

function modelo(over: Partial<ModeloCatalogo> = {}): ModeloCatalogo {
  return {
    modelCode: 'SM-A175F',
    nombre: 'Celular Samsung Galaxy A17 4/128 GB',
    marca: 'Samsung',
    activo: true,
    lockSolution: 'knox_guard',
    dispositivos: 250,
    alias: ['Samsung Galaxy A17 4/128GB'],
    ...over,
  }
}

const CATALOGO: ModeloCatalogo[] = [
  modelo(),
  modelo({ modelCode: 'XT2535 (g06)', nombre: 'Motorola Moto G06 64gb', marca: 'Motorola', alias: [] }),
  modelo({ modelCode: 'XT2536 (g06)', nombre: 'Motorola Moto G06 4/128GB', marca: 'Motorola', alias: [] }),
  modelo({ modelCode: 'xi002', nombre: 'Xiaomi Redmi 14C 256/4 GB', marca: 'Xiaomi', alias: [] }),
]

describe('buscarModelos', () => {
  it('consulta vacía devuelve todo el catálogo ordenado por marca y nombre', () => {
    const r = buscarModelos('', CATALOGO)
    expect(r).toHaveLength(4)
    expect(r[0].marca).toBe('Motorola')
  })

  it('matchea por tokens sin importar el orden ni mayúsculas', () => {
    const r = buscarModelos('a17 samsung', CATALOGO)
    expect(r).toHaveLength(1)
    expect(r[0].modelCode).toBe('SM-A175F')
  })

  it('tolera variantes de RAM/almacenamiento: "a17 128gb" matchea "4/128 GB"', () => {
    expect(buscarModelos('a17 128gb', CATALOGO)).toHaveLength(1)
    expect(buscarModelos('a17 4/128', CATALOGO)).toHaveLength(1)
  })

  it('tolera el par invertido de Xiaomi: "14c 4/256" matchea "256/4 GB"', () => {
    const r = buscarModelos('14c 4/256', CATALOGO)
    expect(r).toHaveLength(1)
    expect(r[0].modelCode).toBe('xi002')
  })

  it('matchea también contra los alias, no solo el nombre canónico', () => {
    // el alias no tiene la palabra "Celular"; el nombre canónico sí
    const r = buscarModelos('galaxy a17 128', [modelo({ nombre: 'Nombre Interno Raro', alias: ['Samsung Galaxy A17 4/128GB'] })])
    expect(r).toHaveLength(1)
  })

  it('un modelo con varios alias que matchean aparece una sola vez', () => {
    const r = buscarModelos('a17', [modelo({ alias: ['Samsung A17 128', 'Galaxy A17 4/128'] })])
    expect(r).toHaveLength(1)
  })

  it('buscar por marca lista todos los de esa marca', () => {
    expect(buscarModelos('motorola', CATALOGO)).toHaveLength(2)
  })

  it('sin coincidencias devuelve vacío', () => {
    expect(buscarModelos('iphone 15', CATALOGO)).toHaveLength(0)
  })
})
