import { describe, it, expect } from 'vitest'
import crypto from 'crypto'
import { verificarFirmaNovedades, parseNovedades } from '@/lib/novedades'

const SECRET = 'test-secret'
const firmar = (ts: string, body: string) =>
  crypto.createHmac('sha256', SECRET).update(`${ts}.${body}`).digest('hex')

describe('verificarFirmaNovedades', () => {
  const ahora = new Date('2026-09-11T12:00:00Z')
  const ts = '2026-09-11T12:00:00Z'
  const body = '{"titulo":"x"}'

  it('acepta firma válida dentro de la ventana', () => {
    expect(verificarFirmaNovedades(SECRET, ts, body, firmar(ts, body), ahora).ok).toBe(true)
  })

  it('rechaza firma incorrecta', () => {
    const r = verificarFirmaNovedades(SECRET, ts, body, firmar(ts, 'otro-body'), ahora)
    expect(r).toEqual({ ok: false, error: 'firma_invalida' })
  })

  it('rechaza timestamp fuera de la ventana de 5 minutos', () => {
    const viejo = '2026-09-11T11:54:00Z'
    const r = verificarFirmaNovedades(SECRET, viejo, body, firmar(viejo, body), ahora)
    expect(r).toEqual({ ok: false, error: 'timestamp_vencido' })
  })

  it('rechaza timestamp no parseable', () => {
    expect(verificarFirmaNovedades(SECRET, 'ayer', body, 'x', ahora).ok).toBe(false)
  })
})

describe('parseNovedades', () => {
  it('contrato v2: acepta id estable y en_respuesta_a opcionales', () => {
    const r = parseNovedades({ titulo: 'Fix aplicado', id: 'nov-123', en_respuesta_a: 'a0b1c2' })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.novedades[0].id_externo).toBe('nov-123')
      expect(r.novedades[0].en_respuesta_a).toBe('a0b1c2')
    }
  })

  it('contrato v2: sin id ni en_respuesta_a quedan null', () => {
    const r = parseNovedades({ titulo: 'Suelto' })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.novedades[0].id_externo).toBeNull()
      expect(r.novedades[0].en_respuesta_a).toBeNull()
    }
  })

  it('acepta una novedad suelta', () => {
    const r = parseNovedades({ titulo: 'Nueva columna en orders', tipo: 'schema' })
    expect(r).toEqual({ ok: true, novedades: [{ titulo: 'Nueva columna en orders', detalle: null, tipo: 'schema', referencia: null, id_externo: null, en_respuesta_a: null }] })
  })

  it('acepta batch { novedades: [...] }', () => {
    const r = parseNovedades({ novedades: [{ titulo: 'a' }, { titulo: 'b', detalle: 'det', referencia: 'orders' }] })
    if (!r.ok) throw new Error('debió aceptar')
    expect(r.novedades).toHaveLength(2)
    expect(r.novedades[1]).toEqual({ titulo: 'b', detalle: 'det', tipo: null, referencia: 'orders', id_externo: null, en_respuesta_a: null })
  })

  it('rechaza sin título', () => {
    expect(parseNovedades({ detalle: 'x' })).toEqual({ ok: false, error: 'titulo_requerido' })
    expect(parseNovedades({ novedades: [{ titulo: '  ' }] })).toEqual({ ok: false, error: 'titulo_requerido' })
  })

  it('rechaza batch vacío y batch gigante', () => {
    expect(parseNovedades({ novedades: [] })).toEqual({ ok: false, error: 'sin_novedades' })
    const muchos = { novedades: Array.from({ length: 51 }, (_, i) => ({ titulo: `n${i}` })) }
    expect(parseNovedades(muchos)).toEqual({ ok: false, error: 'demasiadas_novedades' })
  })

  it('trunca campos largos', () => {
    const r = parseNovedades({ titulo: 'x'.repeat(500), detalle: 'y'.repeat(5000) })
    if (!r.ok) throw new Error('debió aceptar')
    expect(r.novedades[0].titulo).toHaveLength(300)
    expect(r.novedades[0].detalle).toHaveLength(2000)
  })
})
