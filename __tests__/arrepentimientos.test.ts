import { describe, expect, it } from 'vitest'
import {
  decidirAccionMail,
  evaluarVentanaArrepentimiento,
  esMailDelBoton,
  etiquetaFulfillment,
  parsearAsuntoArrepentimiento,
} from '@/lib/arrepentimientos'

describe('etiquetaFulfillment', () => {
  it('mapea el pipeline del warehouse a la etiqueta operativa', () => {
    expect(etiquetaFulfillment({ whEstado: 'queued', pickeado: false })).toBe('en cola')
    expect(etiquetaFulfillment({ whEstado: 'sent', pickeado: false })).toBe('enviado a Andreani')
    expect(etiquetaFulfillment({ whEstado: 'sent', pickeado: true })).toBe('pickeado')
    expect(etiquetaFulfillment({ whEstado: 'expedido', pickeado: true })).toBe('expedido')
    expect(etiquetaFulfillment({ whEstado: 'cancelled', pickeado: false })).toBe('cancelado')
    expect(etiquetaFulfillment({ whEstado: 'cancel_requested', pickeado: false })).toBe('cancelado')
    expect(etiquetaFulfillment({ whEstado: null, pickeado: false })).toBeNull()
    // pickeado manda aunque el pedido WH diga otra cosa rara (salvo expedido)
    expect(etiquetaFulfillment({ whEstado: 'requires_attention', pickeado: true })).toBe('pickeado')
  })
})

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
  const orden = { orderNumber: 'SO-X', gocuotasOrderId: '123', gocuotasStatus: 'approved', deliveredAt: '2026-10-01T09:00:00Z', producto: 'Moto G17', tracking: '360001', otrasOrdenes: 0, whEstado: 'expedido', pickeado: true }
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

describe('evaluarVentanaArrepentimiento', () => {
  // Regla de Emiliano (7/10): order_delivered_at de gocuotas_orders es la
  // fecha de confirmación de la compra. Sin delivered_at la compra nunca se
  // aprobó → no corresponde arrepentimiento. Más de 10 días corridos desde
  // la confirmación → se gestiona por otro canal.
  it('sin delivered_at la compra no se aprobó: no corresponde', () => {
    expect(evaluarVentanaArrepentimiento(null, '2026-10-07T10:00:00Z')).toBe('no_aprobada')
  })

  it('mail dentro de los 10 días corridos: vigente', () => {
    expect(evaluarVentanaArrepentimiento('2026-10-01T09:00:00Z', '2026-10-07T10:00:00Z')).toBe('vigente')
  })

  it('el día 10 exacto sigue vigente', () => {
    expect(evaluarVentanaArrepentimiento('2026-09-27T10:00:00Z', '2026-10-07T10:00:00Z')).toBe('vigente')
  })

  it('pasados los 10 días corridos: vencida', () => {
    expect(evaluarVentanaArrepentimiento('2026-09-26T09:59:00Z', '2026-10-07T10:00:00Z')).toBe('vencida')
  })

  it('cuenta contra la fecha del mail, no contra ahora', () => {
    // Entregada hace mucho pero el mail fue al día 3: vigente
    expect(evaluarVentanaArrepentimiento('2026-06-01T09:00:00Z', '2026-06-04T10:00:00Z')).toBe('vigente')
  })
})
