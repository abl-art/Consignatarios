import { describe, it, expect } from 'vitest'
import { armarMixSegmentos, ordenarFilasMix, type CompradorCanal } from '@/lib/segmentos'

const u = (user_id: string, propia: boolean, terceros: boolean): CompradorCanal => ({
  user_id,
  compro_propia: propia,
  compro_terceros: terceros,
})

describe('armarMixSegmentos', () => {
  it('agrupa por segmento contando cada canal por separado y el total una vez', () => {
    const segmentos = new Map<string, string | null>([
      ['1', 'A1'],
      ['2', 'A1'],
      ['3', 'B4'],
    ])
    const mix = armarMixSegmentos([u('1', true, false), u('2', false, true), u('3', true, true)], segmentos)
    expect(mix.get('A1')).toEqual({ propia: 1, terceros: 1, total: 2 })
    // Compró en ambos canales: cuenta en los dos, pero una sola vez en total
    expect(mix.get('B4')).toEqual({ propia: 1, terceros: 1, total: 1 })
  })

  it('manda a S/D a los usuarios sin segmento o fuera del mapa', () => {
    const segmentos = new Map<string, string | null>([['1', null]])
    const mix = armarMixSegmentos([u('1', true, false), u('99', false, true)], segmentos)
    expect(mix.get('S/D')).toEqual({ propia: 1, terceros: 1, total: 2 })
    expect(mix.size).toBe(1)
  })

  it('sin compradores devuelve mapa vacío', () => {
    expect(armarMixSegmentos([], new Map()).size).toBe(0)
  })
})

describe('ordenarFilasMix', () => {
  it('ordena alfabéticamente con S/D al final y no muta la entrada', () => {
    const filas = [
      { segmento: 'S/D', propia: 1, terceros: 0, total: 1 },
      { segmento: 'B2', propia: 1, terceros: 0, total: 1 },
      { segmento: 'A4', propia: 1, terceros: 0, total: 1 },
    ]
    const ordenadas = ordenarFilasMix(filas)
    expect(ordenadas.map(f => f.segmento)).toEqual(['A4', 'B2', 'S/D'])
    expect(filas.map(f => f.segmento)).toEqual(['S/D', 'B2', 'A4'])
  })
})
