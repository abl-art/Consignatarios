import { describe, expect, it } from 'vitest'
import {
  payloadAndreani,
  parseTimelineAndreani,
  duracionesPorEstado,
  duracionTotalHoras,
  formatearDuracion,
  banderasDevolucion,
  esDevolucionFinalizada,
  separarResueltos,
} from '@/lib/devoluciones'
import type { FilaDevolucion } from '@/lib/actions/devoluciones'

// Clave e IV públicos del front de seguimiento de Andreani (NEXT_PUBLIC_* expuestos
// en www.andreani.com/__ENV.js). El payload es determinístico: mismo número → mismo
// string. Verificamos contra un valor capturado de la página real.
const KEY = '12345678901234567890123456789012'
const IV = '1234567890123456'

describe('payloadAndreani', () => {
  it('reproduce el payload cifrado exacto que manda la página de Andreani', () => {
    // Capturado en vivo de https://www.andreani.com/envio/360003128241560
    const esperado =
      'R6vNxS8GmWbY2vU0oYEOxYAJxjmACvs0rQRUTEkRF+0oIz78DgollrK9fkQSTN0xgdd1HFULYgGcFDI7ThEfsTdzUmaQ7FF2nvaz4slnXPTVDqPjd/YvLPgV4TcgVW+A'
    expect(payloadAndreani('360003128241560', KEY, IV)).toBe(esperado)
  })

  it('es determinístico: mismo número devuelve siempre el mismo payload', () => {
    expect(payloadAndreani('360003090368710', KEY, IV)).toBe(
      payloadAndreani('360003090368710', KEY, IV),
    )
  })
})

// Estructura real de la respuesta de api/v3/Tracking (campos que usamos).
// Los `orden` del circuito canónico pueden tener huecos (el 4 "Retirado" no ocurrió)
// y las fechas dentro de un estado pueden venir desordenadas.
const TIMELINE_DEVOLUCION = {
  numeroAndreani: '360003096900250',
  nombreRemitente: 'GOCUOTAS',
  procesoActual: { orden: 6, titulo: 'En devolución', fechaUltimoEvento: '2026-09-17T18:21:47.683' },
  timelines: [
    {
      orden: 1,
      titulo: 'Pendiente de ingreso',
      traducciones: [{ fechaEvento: '2026-09-09T15:36:10', traduccion: 'Devolución pendiente de ingreso.', sucursal: { nombre: null } }],
    },
    {
      orden: 2,
      titulo: 'Ingresado',
      traducciones: [{ fechaEvento: '2026-09-09T15:36:23.01', traduccion: 'Tu solicitud está siendo procesada.', sucursal: { nombre: 'Cerro De Las Rosas' } }],
    },
    {
      orden: 3,
      titulo: 'En retiro',
      traducciones: [
        { fechaEvento: '2026-09-10T15:57:59', traduccion: '<p>No logramos realizar el retiro.</p><p><strong>Motivo</strong>: Rehusado Se Niega A Firmar.</p>', sucursal: { nombre: 'Villa Allende' } },
        { fechaEvento: '2026-09-10T09:17:51.04', traduccion: 'Hoy te visitaremos para retirar tu devolución.', sucursal: { nombre: 'Villa Allende' } },
      ],
    },
    {
      orden: 6,
      titulo: 'En devolución',
      traducciones: [{ fechaEvento: '2026-09-17T18:21:47.683', traduccion: 'Recibimos tu solicitud en la sucursal Cordoba.', sucursal: { nombre: 'Cordoba' } }],
    },
  ],
}

describe('parseTimelineAndreani', () => {
  it('extrae el número, el estado actual y la fecha del último evento', () => {
    const t = parseTimelineAndreani(TIMELINE_DEVOLUCION)
    expect(t.numero).toBe('360003096900250')
    expect(t.estadoActual).toBe('En devolución')
    expect(t.fechaUltimoEvento).toBe('2026-09-17T18:21:47.683')
  })

  it('aplana las traducciones en eventos ordenados cronológicamente y limpia el HTML', () => {
    const t = parseTimelineAndreani(TIMELINE_DEVOLUCION)
    expect(t.eventos.map(e => e.estado)).toEqual([
      'Pendiente de ingreso',
      'Ingresado',
      'En retiro', // 09:17 viene después de reordenar, antes del 15:57
      'En retiro',
      'En devolución',
    ])
    expect(t.eventos[2].fecha).toBe('2026-09-10T09:17:51.04')
    expect(t.eventos[3].texto).toBe('No logramos realizar el retiro. Motivo: Rehusado Se Niega A Firmar.')
    expect(t.eventos[1].sucursal).toBe('Cerro De Las Rosas')
  })

  it('devuelve un timeline vacío cuando Andreani responde null', () => {
    const t = parseTimelineAndreani(null)
    expect(t.estadoActual).toBeNull()
    expect(t.eventos).toEqual([])
  })
})

describe('duracionesPorEstado', () => {
  // 20/09 18:21 hora Argentina (UTC-3) = 21:21 UTC — 72 h después del último evento
  const AHORA = new Date('2026-09-20T21:21:47.683Z')

  it('mide las horas que estuvo en cada estado entre transiciones', () => {
    const { eventos } = parseTimelineAndreani(TIMELINE_DEVOLUCION)
    const tramos = duracionesPorEstado(eventos, AHORA)
    // Pendiente 09-09 15:36 → Ingresado 09-09 15:36 → En retiro 10-09 09:17 → En devolución 17-09 18:21
    expect(tramos.map(t => t.estado)).toEqual([
      'Pendiente de ingreso',
      'Ingresado',
      'En retiro',
      'En devolución',
    ])
    // "En retiro" empezó el 10/09 09:17 y terminó al entrar a "En devolución" el 17/09 18:21
    const enRetiro = tramos[2]
    expect(enRetiro.horas).toBeCloseTo(177.07, 1)
    expect(enRetiro.enCurso).toBe(false)
  })

  it('colapsa sub-eventos consecutivos del mismo estado en un solo tramo', () => {
    const { eventos } = parseTimelineAndreani(TIMELINE_DEVOLUCION)
    const tramos = duracionesPorEstado(eventos, AHORA)
    // "En retiro" tiene 2 traducciones pero es un único tramo
    expect(tramos.filter(t => t.estado === 'En retiro')).toHaveLength(1)
  })

  it('marca el último estado como en curso y mide hasta ahora', () => {
    const { eventos } = parseTimelineAndreani(TIMELINE_DEVOLUCION)
    const tramos = duracionesPorEstado(eventos, AHORA)
    const actual = tramos[tramos.length - 1]
    expect(actual.estado).toBe('En devolución')
    expect(actual.enCurso).toBe(true)
    expect(actual.hasta).toBeNull()
    // del 17/09 18:21 al 20/09 18:21 = 72 h exactas
    expect(actual.horas).toBeCloseTo(72, 1)
  })

  it('devuelve lista vacía sin eventos', () => {
    expect(duracionesPorEstado([], AHORA)).toEqual([])
  })

  it('no cuenta "hasta ahora" cuando el último estado es terminal: el circuito terminó', () => {
    const eventos = [
      { estado: 'En camino', orden: 3, fecha: '2026-09-18T10:00:00', texto: '', sucursal: null },
      { estado: 'Entregado', orden: 5, fecha: '2026-09-18T15:00:00', texto: '', sucursal: null },
    ]
    const tramos = duracionesPorEstado(eventos, AHORA, ['Entregado', 'Devuelto'])
    const entregado = tramos[tramos.length - 1]
    expect(entregado.estado).toBe('Entregado')
    expect(entregado.enCurso).toBe(false) // es un punto final, no un intervalo abierto
    expect(entregado.horas).toBe(0)
  })
})

describe('duracionTotalHoras', () => {
  const AHORA = new Date('2026-09-20T21:21:47.683Z')

  it('mide del primer evento al último cuando el circuito terminó', () => {
    const eventos = [
      { estado: 'Ingresado', orden: 2, fecha: '2026-09-10T10:00:00', texto: '', sucursal: null },
      { estado: 'Devuelto', orden: 7, fecha: '2026-09-12T10:00:00', texto: '', sucursal: null },
    ]
    // último estado "Devuelto" es terminal → total = 48 h, sin contar hasta ahora
    expect(duracionTotalHoras(eventos, AHORA, ['Devuelto'])).toBeCloseTo(48, 1)
  })

  it('mide del primer evento hasta ahora cuando sigue en curso', () => {
    const { eventos } = parseTimelineAndreani(TIMELINE_DEVOLUCION)
    // primer evento 09-09 15:36 ART → hasta AHORA 20-09 18:21 ART ≈ 266.75 h
    expect(duracionTotalHoras(eventos, AHORA, ['Devuelto'])).toBeCloseTo(266.76, 1)
  })

  it('devuelve 0 sin eventos', () => {
    expect(duracionTotalHoras([], AHORA, ['Devuelto'])).toBe(0)
  })
})

describe('formatearDuracion', () => {
  it('muestra días y horas', () => {
    expect(formatearDuracion(50)).toBe('2 d 2 h')
  })
  it('muestra solo horas cuando es menos de un día', () => {
    expect(formatearDuracion(5.4)).toBe('5 h')
  })
  it('muestra minutos cuando es menos de una hora', () => {
    expect(formatearDuracion(0.5)).toBe('30 min')
  })
})

describe('banderasDevolucion', () => {
  it('alerta cuando el equipo se entregó pero ya figura disponible en stock', () => {
    const b = banderasDevolucion({
      entregaEstado: 'Entregado',
      inventarioStatus: 'available',
      trustonicObservado: 'ready_for_use',
      ordenAnulada: true,
      devolucionEventos: 1,
    })
    expect(b).toContain('stock_sin_retorno')
  })

  it('alerta cuando la orden está anulada y el equipo sigue activo en Trustonic', () => {
    const b = banderasDevolucion({
      entregaEstado: 'Entregado',
      inventarioStatus: 'returned',
      trustonicObservado: 'active',
      ordenAnulada: true,
      devolucionEventos: 3,
    })
    expect(b).toContain('trustonic_activo_anulada')
  })

  it('alerta cuando la devolución no tiene ningún evento en Andreani', () => {
    const b = banderasDevolucion({
      entregaEstado: 'Entregado',
      inventarioStatus: 'returned',
      trustonicObservado: 'ready_for_use',
      ordenAnulada: true,
      devolucionEventos: 0,
    })
    expect(b).toContain('devolucion_sin_movimiento')
  })

  it('no alerta cuando todo está consistente', () => {
    const b = banderasDevolucion({
      entregaEstado: 'Entregado',
      inventarioStatus: 'returned',
      trustonicObservado: 'ready_for_use',
      ordenAnulada: true,
      devolucionEventos: 4,
    })
    expect(b).toEqual([])
  })
})

describe('esDevolucionFinalizada', () => {
  it('es finalizada cuando el equipo volvió (Devuelto) y no hay alertas', () => {
    expect(esDevolucionFinalizada('Devuelto', [])).toBe(true)
  })

  it('NO es finalizada si está devuelta pero arrastra una alerta (requiere gestión)', () => {
    expect(esDevolucionFinalizada('Devuelto', ['trustonic_activo_anulada'])).toBe(false)
  })

  it('NO es finalizada mientras está en viaje de vuelta (Retirado / En devolución)', () => {
    expect(esDevolucionFinalizada('Retirado', [])).toBe(false)
    expect(esDevolucionFinalizada('En devolución', [])).toBe(false)
  })

  it('NO es finalizada si el retiro falló (No retirado)', () => {
    expect(esDevolucionFinalizada('No retirado', [])).toBe(false)
  })

  it('NO es finalizada sin estado (devolución sin movimiento)', () => {
    expect(esDevolucionFinalizada(null, ['devolucion_sin_movimiento'])).toBe(false)
  })
})

// Fixture mínimo de una fila de la tabla de devoluciones. Los campos que no
// importan para separarResueltos quedan con valores neutros.
function filaDevolucion(overrides: Partial<FilaDevolucion>): FilaDevolucion {
  return {
    orderNumber: 'ORD-1',
    gocuotasOrderId: null,
    cliente: 'Cliente',
    dni: null,
    producto: 'Producto',
    imei: null,
    ciudad: null,
    provincia: null,
    returnCreadoAt: '2026-10-01T00:00:00Z',
    ordenAnulada: false,
    inventarioStatus: null,
    trustonicObservado: null,
    entrega: { tracking: null, estadoActual: null, tramos: [], totalHoras: 0, consultado: false },
    devolucion: { tracking: null, estadoActual: null, tramos: [], totalHoras: 0, consultado: false },
    banderas: [],
    recibidoWhGo: false,
    resueltoAt: null,
    ...overrides,
  }
}

describe('separarResueltos', () => {
  it('manda a pendientes una fila con estadoActual terminal (Devuelto) pero resueltoAt null: nada se archiva solo', () => {
    const fila = filaDevolucion({
      devolucion: { tracking: '123', estadoActual: 'Devuelto', tramos: [], totalHoras: 10, consultado: true },
      resueltoAt: null,
    })
    const { pendientes, resueltas } = separarResueltos([fila])
    expect(pendientes).toEqual([fila])
    expect(resueltas).toEqual([])
  })

  it('manda a resueltas una fila con resueltoAt seteado, sin importar el estado de Andreani', () => {
    const fila = filaDevolucion({
      devolucion: { tracking: '456', estadoActual: 'En retiro', tramos: [], totalHoras: 5, consultado: true },
      resueltoAt: '2026-10-20T12:00:00Z',
    })
    const { pendientes, resueltas } = separarResueltos([fila])
    expect(resueltas).toEqual([fila])
    expect(pendientes).toEqual([])
  })

  it('separa un mix de filas en sus dos grupos preservando el orden', () => {
    const a = filaDevolucion({ orderNumber: 'A', resueltoAt: null })
    const b = filaDevolucion({ orderNumber: 'B', resueltoAt: '2026-10-15T00:00:00Z' })
    const c = filaDevolucion({ orderNumber: 'C', resueltoAt: null })
    const { pendientes, resueltas } = separarResueltos([a, b, c])
    expect(pendientes.map(f => f.orderNumber)).toEqual(['A', 'C'])
    expect(resueltas.map(f => f.orderNumber)).toEqual(['B'])
  })
})
