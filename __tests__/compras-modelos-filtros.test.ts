import { describe, it, expect } from 'vitest'
import { filtrosInicialesModelos } from '@/lib/compras-modelos-filtros'

const productos = [
  { id: 'tv1', categoria: 'TV, Sonido y Electronicos', plataforma: 'gomarket' },
  { id: 'cel1', categoria: 'Celulares', plataforma: 'gocelular' },
  { id: 'kit1', categoria: null, plataforma: undefined },
]

describe('filtrosInicialesModelos', () => {
  it('con ?producto= de un gomarket preselecciona su categoría y la tienda gomarket', () => {
    expect(filtrosInicialesModelos('tv1', productos)).toEqual({
      categoria: 'TV, Sonido y Electronicos',
      tienda: 'gomarket',
    })
  })

  it('producto gocelular (o sin plataforma) → tienda gocelular', () => {
    expect(filtrosInicialesModelos('cel1', productos)).toEqual({ categoria: 'Celulares', tienda: 'gocelular' })
    expect(filtrosInicialesModelos('kit1', productos)).toEqual({ categoria: '', tienda: 'gocelular' })
  })

  it('sin param o producto inexistente → null (no toca los filtros)', () => {
    expect(filtrosInicialesModelos(null, productos)).toBeNull()
    expect(filtrosInicialesModelos('nope', productos)).toBeNull()
  })
})
