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


  it('en_respuesta_a debe ser un uuid (contrato de Pedro)', () => {
    expect(validarNovedadSaliente({ titulo: 'x', enRespuestaA: 'no-es-uuid' })).toContain('en_respuesta_a debe ser un uuid (el id que generó GOcelular para su novedad)')
    expect(validarNovedadSaliente({ titulo: 'x', enRespuestaA: 'ad42d1cb-1513-41b5-8116-f22ca1904b9e' })).toEqual([])
    expect(validarNovedadSaliente({ titulo: 'x' })).toEqual([])
  })
  it('el tipo tiene que ser schema, feature o aviso', () => {
    expect(validarNovedadSaliente({ titulo: 'x', tipo: 'bug' })).toContain('Tipo inválido: schema, feature o aviso')
    expect(validarNovedadSaliente({ titulo: 'x', tipo: 'aviso' })).toEqual([])
    expect(validarNovedadSaliente({ titulo: 'x', tipo: '' })).toEqual([])
  })
})

describe('armarNovedadSaliente', () => {
  it('incluye id y en_respuesta_a cuando vienen', () => {
    const n = armarNovedadSaliente({ titulo: 'Re: alias A16', id: 'uuid-1', enRespuestaA: 'nov-ped-9' })
    expect(n.id).toBe('uuid-1')
    expect(n.en_respuesta_a).toBe('nov-ped-9')
  })

  it('recorta a los topes del contrato y omite los campos vacíos', () => {
    const n = armarNovedadSaliente({
      titulo: '  ' + 'T'.repeat(400) + '  ',
      detalle: 'D'.repeat(3000),
      tipo: 'aviso',
      referencia: '  ',
    })
    expect(n.titulo).toHaveLength(200)
    expect(n.detalle).toHaveLength(2000)
    expect(n.tipo).toBe('aviso')
    expect(n).not.toHaveProperty('referencia')
  })

  it('una novedad mínima queda solo con título', () => {
    expect(armarNovedadSaliente({ titulo: 'Hola Pedro' })).toEqual({ titulo: 'Hola Pedro' })
  })
})
