import { describe, expect, it } from 'vitest'
import {
  decidirAccionMail,
  esMailDelBoton,
  parsearAsuntoArrepentimiento,
} from '@/lib/arrepentimientos'

describe('parsearAsuntoArrepentimiento', () => {
  it('parsea el formato real de n8n (dobles espacios, tildes, nombres compuestos)', () => {
    expect(parsearAsuntoArrepentimiento('Arrepentimiento —  Martina Zacarias (DNI 30628243)'))
      .toEqual({ nombre: 'Martina Zacarias', dni: '30628243' })
    expect(parsearAsuntoArrepentimiento('Arrepentimiento —  Vanina Gisel Murúa  (DNI 35055134)'))
      .toEqual({ nombre: 'Vanina Gisel Murúa', dni: '35055134' })
    expect(parsearAsuntoArrepentimiento('Arrepentimiento —  Eugenia del valle  Ginard  (DNI 25211770)'))
      .toEqual({ nombre: 'Eugenia del valle Ginard', dni: '25211770' })
    expect(parsearAsuntoArrepentimiento('Arrepentimiento — Andres Castañeda (DNI 34393089)'))
      .toEqual({ nombre: 'Andres Castañeda', dni: '34393089' })
  })

  it('rechaza asuntos que no son del botón', () => {
    expect(parsearAsuntoArrepentimiento('arrepentimiento de mi compra')).toBeNull()
    expect(parsearAsuntoArrepentimiento('Re: Arrepentimiento —  Juan Perez (DNI 11222333)')).toBeNull()
    expect(parsearAsuntoArrepentimiento('Arrepentimiento — Juan Perez (DNI abc)')).toBeNull()
    expect(parsearAsuntoArrepentimiento(null)).toBeNull()
  })
})

describe('esMailDelBoton', () => {
  const base = {
    from: 'gocelulares@gocuotas.com',
    asunto: 'Arrepentimiento —  Erika Ponce (DNI 36227906)',
    texto: 'SOLICITUD DE ARREPENTIMIENTO ... GOcelular Botón de Arrepentimiento',
  }
  it('acepta solo con las tres firmas', () => {
    expect(esMailDelBoton(base)).toBe(true)
  })
  it('acepta la marca cortada por salto de línea (wrap real del texto plano del mail)', () => {
    expect(esMailDelBoton({
      ...base,
      texto: 'Solicitud recibida: 2026-10-04T08:43:34.226Z — GOcelular Botón de\nArrepentimiento',
    })).toBe(true)
  })
  it('rechaza si falla cualquiera de las tres', () => {
    expect(esMailDelBoton({ ...base, from: 'cliente@gmail.com' })).toBe(false)
    expect(esMailDelBoton({ ...base, asunto: 'me arrepentí de la compra' })).toBe(false)
    expect(esMailDelBoton({ ...base, texto: 'hola quiero devolver el celu' })).toBe(false)
    expect(esMailDelBoton({ ...base, texto: null })).toBe(false)
  })
})

describe('decidirAccionMail', () => {
  const orden = { orderNumber: 'SO-X', gocuotasOrderId: '123', gocuotasStatus: 'approved', producto: 'Moto G17', tracking: '360001', otrasOrdenes: 0 }
  it('misma orden ya solicitada → insistencia (cualquier estado)', () => {
    expect(decidirAccionMail({ orden, existentes: [{ id: 'a1', gocuotasOrderId: '123' }], rescateYaSolicitado: false }))
      .toEqual({ tipo: 'insistencia', solicitudId: 'a1' })
  })
  it('sin orden matcheada y ya hay solicitud sin orden del mismo DNI → insistencia', () => {
    expect(decidirAccionMail({ orden: null, existentes: [{ id: 'a2', gocuotasOrderId: null }], rescateYaSolicitado: false }))
      .toEqual({ tipo: 'insistencia', solicitudId: 'a2' })
  })
  it('orden nueva de un DNI con solicitud vieja de OTRA orden → nueva', () => {
    expect(decidirAccionMail({ orden, existentes: [{ id: 'a3', gocuotasOrderId: '999' }], rescateYaSolicitado: false }))
      .toEqual({ tipo: 'nueva' })
  })
  it('rescate ya solicitado por otro canal → ya_solicitado', () => {
    expect(decidirAccionMail({ orden, existentes: [], rescateYaSolicitado: true }))
      .toEqual({ tipo: 'ya_solicitado' })
  })
  it('DNI sin orden y sin solicitudes previas → nueva (fila "sin orden")', () => {
    expect(decidirAccionMail({ orden: null, existentes: [], rescateYaSolicitado: false }))
      .toEqual({ tipo: 'nueva' })
  })
})
