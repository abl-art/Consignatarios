import { describe, it, expect } from 'vitest'
import { armarComprasMismoDia, type CasoMismoDia } from '@/lib/compras-mismo-dia'

const HOY = new Date('2026-10-08T12:00:00')

function caso(over: Partial<CasoMismoDia>): CasoMismoDia {
  return {
    storeName: 'STORE A',
    clientId: '5495277',
    userDni: '30111222',
    userName: 'Test User',
    fecha: '2026-10-01',
    ordenes: 2,
    monto: 1_000_000,
    sinActivar: 0,
    bloqueados: 0,
    primeraVentaStore: '2026-05-01',
    ...over,
  }
}

describe('armarComprasMismoDia', () => {
  it('excluye tiendas con un solo caso en la ventana (ruido de fondo)', () => {
    const r = armarComprasMismoDia([caso({})], HOY)
    expect(r).toHaveLength(0)
  })

  it('marca rojo un pico sin historial previo (tienda que arranca con dobles)', () => {
    const casos = ['2026-10-01', '2026-10-02', '2026-10-03'].map((fecha, i) =>
      caso({ fecha, userDni: `dni${i}` }),
    )
    const r = armarComprasMismoDia(casos, HOY)
    expect(r).toHaveLength(1)
    expect(r[0].nivel).toBe('rojo')
    expect(r[0].casos30).toBe(3)
    expect(r[0].ordenes30).toBe(6)
  })

  it('tienda con ritmo histórico alto y pico equivalente queda en ámbar', () => {
    // 5 meses de vida, 10 casos previos (ritmo 2/mes aprox) y 3 recientes: no triplica
    const previos = Array.from({ length: 10 }, (_, i) =>
      caso({ fecha: `2026-0${(i % 4) + 5}-10`, userDni: `prev${i}` }),
    )
    const recientes = ['2026-10-01', '2026-10-02', '2026-10-03'].map((fecha, i) =>
      caso({ fecha, userDni: `rec${i}` }),
    )
    const r = armarComprasMismoDia([...previos, ...recientes], HOY)
    expect(r).toHaveLength(1)
    expect(r[0].nivel).toBe('ambar')
    expect(r[0].ritmoPrevio).toBeGreaterThan(1)
  })

  it('caso La Banda: pico de 17 casos contra ritmo previo ~1/mes da rojo', () => {
    const previos = ['2026-06-10', '2026-06-15', '2026-06-29', '2026-07-13'].map((fecha, i) =>
      caso({ fecha, userDni: `prev${i}` }),
    )
    const recientes = Array.from({ length: 17 }, (_, i) =>
      caso({ fecha: i < 4 ? '2026-09-25' : '2026-10-0' + ((i % 5) + 1), userDni: `rec${i}` }),
    )
    const r = armarComprasMismoDia([...previos, ...recientes], HOY)
    expect(r[0].nivel).toBe('rojo')
    expect(r[0].casos30).toBe(17)
  })

  it('ordena rojo primero y por casos30 descendente', () => {
    const rojo = ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'].map((fecha, i) =>
      caso({ fecha, userDni: `r${i}`, storeName: 'PICO' }),
    )
    const ambar = ['2026-10-01', '2026-10-02'].map((fecha, i) =>
      caso({ fecha, userDni: `a${i}`, storeName: 'LEVE' }),
    )
    const r = armarComprasMismoDia([...ambar, ...rojo], HOY)
    expect(r.map(s => s.storeName)).toEqual(['PICO', 'LEVE'])
  })

  it('los casos de la ventana vienen más recientes primero y suma sinActivar', () => {
    const casos = [
      caso({ fecha: '2026-10-01', userDni: 'a', sinActivar: 2 }),
      caso({ fecha: '2026-10-05', userDni: 'b', sinActivar: 1 }),
    ]
    const r = armarComprasMismoDia(casos, HOY)
    expect(r[0].casos.map(c => c.fecha)).toEqual(['2026-10-05', '2026-10-01'])
    expect(r[0].sinActivar30).toBe(3)
  })
})
