import { describe, it, expect } from 'vitest'
import { armarUpselling, waLink, type OrdenPagaRaw } from '@/lib/upselling'

const paga = (orderId: string, userId: string, ultimaCuotaAt: string, extra: Partial<OrdenPagaRaw> = {}): OrdenPagaRaw => ({
  orderId,
  userId,
  nombre: 'Cliente ' + userId,
  dni: '30111222',
  producto: 'Moto G06',
  ultimaCuotaAt,
  cuotas: 9,
  monto: 500000,
  ...extra,
})

describe('armarUpselling', () => {
  it('una fila por cliente, con teléfono y ordenado por última cuota descendente', () => {
    const filas = armarUpselling(
      [paga('o1', 'u1', '2026-08-01'), paga('o2', 'u2', '2026-09-01')],
      { u1: '1151118810' },
      [],
      [],
    )
    expect(filas.map(f => f.userId)).toEqual(['u2', 'u1'])
    expect(filas[1].telefono).toBe('1151118810')
    expect(filas[0].telefono).toBeNull()
    expect(filas[0].contactadoAt).toBeNull()
    expect(filas[0].recompra).toBeNull()
  })

  it('cliente con dos órdenes pagas: muestra la más reciente y cuenta ambas', () => {
    const filas = armarUpselling(
      [paga('o1', 'u1', '2026-05-01', { producto: 'Viejo' }), paga('o2', 'u1', '2026-08-01', { producto: 'Nuevo' })],
      {},
      [],
      [],
    )
    expect(filas).toHaveLength(1)
    expect(filas[0].producto).toBe('Nuevo')
    expect(filas[0].ordenesPagas).toBe(2)
  })

  it('recompra: orden creada DESPUÉS del contacto marca el check con esa orden', () => {
    const filas = armarUpselling(
      [paga('o1', 'u1', '2026-08-01')],
      {},
      [
        { orderId: 'o1', userId: 'u1', createdAt: '2026-03-01', producto: 'Moto G06' }, // la orden paga original
        { orderId: 'o9', userId: 'u1', createdAt: '2026-09-05', producto: 'Moto G17' }, // posterior al contacto
      ],
      [{ userId: 'u1', contactadoAt: '2026-09-01T10:00:00Z', nota: 'ofrecí G17' }],
    )
    expect(filas[0].recompra).toEqual({ orderId: 'o9', createdAt: '2026-09-05', producto: 'Moto G17' })
    expect(filas[0].nota).toBe('ofrecí G17')
  })

  it('sin contacto no se evalúa recompra aunque haya órdenes nuevas', () => {
    const filas = armarUpselling(
      [paga('o1', 'u1', '2026-08-01')],
      {},
      [{ orderId: 'o9', userId: 'u1', createdAt: '2026-09-05', producto: 'X' }],
      [],
    )
    expect(filas[0].recompra).toBeNull()
  })

  it('órdenes anteriores al contacto o ya pagas no cuentan como recompra', () => {
    const filas = armarUpselling(
      [paga('o1', 'u1', '2026-08-01')],
      {},
      [
        { orderId: 'o1', userId: 'u1', createdAt: '2026-09-02', producto: 'Moto G06' }, // es la misma orden paga
        { orderId: 'o0', userId: 'u1', createdAt: '2026-08-20', producto: 'Anterior' }, // antes del contacto
      ],
      [{ userId: 'u1', contactadoAt: '2026-09-01T10:00:00Z', nota: null }],
    )
    expect(filas[0].recompra).toBeNull()
  })
})

describe('waLink', () => {
  it('celular sin prefijo país → 549 + número', () => {
    expect(waLink('1151118810')).toBe('https://wa.me/5491151118810')
  })
  it('con +54 pero sin 9 → inserta el 9', () => {
    expect(waLink('+541176225947')).toBe('https://wa.me/5491176225947')
  })
  it('ya completo con 549 queda igual', () => {
    expect(waLink('+5491176225947')).toBe('https://wa.me/5491176225947')
  })
})
