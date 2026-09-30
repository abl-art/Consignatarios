import { describe, it, expect } from 'vitest'
import { validarNovedadSaliente, armarNovedadSaliente } from '@/lib/novedades-salientes'

describe('validarNovedadSaliente', () => {
  it('pasa con título solo', () => {
    expect(validarNovedadSaliente({ titulo: 'Webhook de compras v2' })).toEqual([])
  })

  it('el título es obligatorio', () => {
    expect(validarNovedadSaliente({ titulo: '' })).toContain('El título es obligatorio')
    expect(validarNovedadSaliente({ titulo: '   ' })).toContain('El título es obligatorio')
  })

  it('el tipo tiene que ser schema, feature o aviso', () => {
    expect(validarNovedadSaliente({ titulo: 'x', tipo: 'bug' })).toContain('Tipo inválido: schema, feature o aviso')
    expect(validarNovedadSaliente({ titulo: 'x', tipo: 'aviso' })).toEqual([])
    expect(validarNovedadSaliente({ titulo: 'x', tipo: '' })).toEqual([])
  })
})

describe('armarNovedadSaliente', () => {
  it('recorta a los topes del contrato y omite los campos vacíos', () => {
    const n = armarNovedadSaliente({
      titulo: '  ' + 'T'.repeat(400) + '  ',
      detalle: 'D'.repeat(3000),
      tipo: 'aviso',
      referencia: '  ',
    })
    expect(n.titulo).toHaveLength(300)
    expect(n.detalle).toHaveLength(2000)
    expect(n.tipo).toBe('aviso')
    expect(n).not.toHaveProperty('referencia')
  })

  it('una novedad mínima queda solo con título', () => {
    expect(armarNovedadSaliente({ titulo: 'Hola Pedro' })).toEqual({ titulo: 'Hola Pedro' })
  })
})
