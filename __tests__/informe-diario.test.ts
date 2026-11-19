import { describe, it, expect } from 'vitest'
import {
  seleccionarMesesPD,
  cohortesMaduras,
  veredictoForecast,
  serieCaja,
  armarInformeDiario,
  type PDCelda,
  type DatosInforme,
  type ForecastMes,
} from '@/lib/informe-diario'
import type { VintageRow } from '@/lib/actions/finanzas'
import type { FlujoDiario } from '@/lib/flujo-canal'

// ─── Factories ────────────────────────────────────────────────────────────

function celda(mes: string, cuota: number, extra: Partial<PDCelda> = {}): PDCelda {
  return { mes, cuota, pdHard: 10, pd30: 5, denHard: 1000, den30: 800, ...extra }
}

function vintage(mes: string, extra: Partial<VintageRow> = {}): VintageRow {
  const base: VintageRow = {
    origination_month: mes,
    amt_total: 1000,
    amt_por_vencer: 0,
    amt_cobrada_en_termino: 800,
    amt_mora_1_29: 0,
    amt_mora_30_59: 0,
    amt_mora_60_89: 0,
    amt_incobrable_90_plus: 50,
    amt_recupero_1_29: 150,
    amt_recupero_30_59: 0,
    amt_recupero_60_89: 0,
    amt_recupero_90_119: 0,
    amt_recupero_120_plus: 0,
    pct_por_vencer: 0,
    pct_cobrada_en_termino: 80,
    pct_mora_1_29: 0,
    pct_mora_30_59: 0,
    pct_mora_60_89: 0,
    pct_incobrable_90_plus: 5,
    pct_recupero_1_29: 15,
    pct_recupero_30_59: 0,
    pct_recupero_60_89: 0,
    pct_recupero_90_119: 0,
    pct_recupero_120_plus: 0,
  }
  return { ...base, ...extra }
}

function flujoDia(cash_date: string, cash_balance: number): FlujoDiario {
  return {
    cash_date,
    in_adelantado: 0, in_en_termino: 0, in_atrasado: 0, in_pendiente: 0, in_vencida: 0,
    in_asistencia: 0, in_mayoristas: 0, in_proyectado: 0,
    out_celulares: 0, out_licencias: 0, out_descartables: 0, out_sueldos: 0,
    out_envios: 0, out_interes: 0, out_otros: 0, out_vta3ero: 0, out_dev_capital: 0,
    net_flow: 0,
    cash_balance,
  }
}

function datosBase(extra: Partial<DatosInforme> = {}): DatosInforme {
  return {
    fecha: '2026-11-19',
    ayer: '2026-11-18',
    ventas: null,
    forecast: null,
    seguros: null,
    caja: null,
    pd: null,
    incobrabilidad: null,
    deposito: null,
    agenda: null,
    ...extra,
  }
}

// ─── seleccionarMesesPD ───────────────────────────────────────────────────

describe('seleccionarMesesPD', () => {
  it('elige los 3 meses más recientes con todas las cuotas con denominador', () => {
    const filas: PDCelda[] = []
    for (const mes of ['2026-05', '2026-06', '2026-07', '2026-08']) {
      for (const cuota of [2, 3, 4]) filas.push(celda(mes, cuota))
    }
    // Mes joven: cuota 4 sin den30 todavía
    filas.push(celda('2026-09', 2), celda('2026-09', 3), celda('2026-09', 4, { den30: 0 }))

    const r = seleccionarMesesPD(filas, [2, 3, 4], 3)
    expect(r.meses).toEqual(['2026-06', '2026-07', '2026-08'])
    expect(r.nota).toBeNull()
  })

  it('sin meses completos cae a los meses con C2 y nota explicando qué falta', () => {
    const filas: PDCelda[] = [
      celda('2026-09', 2),
      celda('2026-09', 3, { denHard: 0, den30: 0 }),
      celda('2026-09', 4, { denHard: 0, den30: 0 }),
      celda('2026-10', 2),
      celda('2026-10', 3, { denHard: 0, den30: 0 }),
      celda('2026-10', 4, { denHard: 0, den30: 0 }),
    ]
    const r = seleccionarMesesPD(filas, [2, 3, 4], 3)
    expect(r.meses).toEqual(['2026-09', '2026-10'])
    expect(r.nota).toMatch(/C4/)
  })
})

// ─── cohortesMaduras ──────────────────────────────────────────────────────

describe('cohortesMaduras', () => {
  it('excluye meses con mora viva o por vencer y devuelve los últimos 6 ascendente', () => {
    const rows = [
      vintage('2026-01'), vintage('2026-02'), vintage('2026-03'), vintage('2026-04'),
      vintage('2026-05'), vintage('2026-06'), vintage('2026-07'),
      vintage('2026-08', { amt_mora_30_59: 100 }), // mora viva → no madura
      vintage('2026-09', { amt_por_vencer: 500 }), // por vencer → no madura
    ]
    const r = cohortesMaduras(rows)
    expect(r.map(x => x.origination_month)).toEqual([
      '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07',
    ])
  })
})

// ─── veredictoForecast ────────────────────────────────────────────────────

function mesForecast(realVentas: number, fraccion: number): ForecastMes {
  return {
    mes: '2026-11',
    realParcial: { ventas: realVentas, monto: 0 },
    hibrido: { ventas: 1000 },
    gocuotas: { ventas: 900 },
    fraccionTranscurrida: fraccion,
  }
}

describe('veredictoForecast', () => {
  it('≥97% del peor método: se encamina a cumplir', () => {
    const v = veredictoForecast(mesForecast(600, 0.6)) // runRate 1000 → ratios 1.0 / 1.11
    expect(v.runRate).toBe(1000)
    expect(v.contraHibrido).toBeCloseTo(1.0)
    expect(v.frase).toContain('se encamina a cumplir')
  })

  it('entre 90% y 97%: va justo', () => {
    const v = veredictoForecast(mesForecast(570, 0.6)) // runRate 950 → peor 0.95
    expect(v.frase).toContain('va justo')
  })

  it('debajo de 90%: no llega', () => {
    const v = veredictoForecast(mesForecast(480, 0.6)) // runRate 800 → peor 0.8
    expect(v.frase).toContain('no llega')
  })

  it('sin proyección congelada lo dice', () => {
    const v = veredictoForecast({
      mes: '2026-11', realParcial: { ventas: 100, monto: 0 },
      hibrido: null, gocuotas: null, fraccionTranscurrida: 0.5,
    })
    expect(v.contraHibrido).toBeNull()
    expect(v.frase).toContain('sin proyección congelada')
  })
})

// ─── serieCaja ────────────────────────────────────────────────────────────

describe('serieCaja', () => {
  it('devuelve hoy hasta hoy+7 inclusive', () => {
    const flujo: FlujoDiario[] = []
    for (let d = 10; d <= 30; d++) flujo.push(flujoDia(`2026-11-${String(d).padStart(2, '0')}`, d * 100))
    const r = serieCaja(flujo, '2026-11-19', 7)
    expect(r.map(x => x.fecha)).toEqual([
      '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22',
      '2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26',
    ])
    expect(r[0].saldo).toBe(1900)
  })
})

// ─── armarInformeDiario ───────────────────────────────────────────────────

describe('armarInformeDiario', () => {
  it('día sin ventas: muestra 0 órdenes sin romper', () => {
    const { html } = armarInformeDiario(datosBase({
      ventas: { propia: { ordenes: 0, monto: 0 }, terceros: { ordenes: 0, monto: 0 }, modelos: [] },
    }))
    expect(html).toContain('0 órdenes')
    expect(html).not.toContain('NaN')
    expect(html).not.toContain('undefined')
  })

  it('caja caída: nota de ventana de backup, el resto vive', () => {
    const { html } = armarInformeDiario(datosBase({
      seguros: { emitidas: 12, siniestros: 1 },
    }))
    expect(html).toContain('ventana de backup')
    expect(html).toContain('12')
  })

  it('modelo sin match en inventario/forecast: muestra — y nunca NaN', () => {
    const { html } = armarInformeDiario(datosBase({
      ventas: {
        propia: { ordenes: 3, monto: 300 }, terceros: { ordenes: 0, monto: 0 },
        modelos: [{ modelo: 'JBL Go 5', unidades: 3, diasStock: null, aComprarMin: null, aComprarMax: null }],
      },
    }))
    expect(html).toContain('JBL Go 5')
    expect(html).toContain('—')
    expect(html).not.toContain('NaN')
  })

  it('agenda sin calendario conectado: ToDos igual + nota', () => {
    const { html } = armarInformeDiario(datosBase({
      agenda: { todos: [{ texto: 'Pagar Newsan', fecha: '2026-11-19', urgente: true }], eventos: null },
    }))
    expect(html).toContain('Pagar Newsan')
    expect(html).toContain('calendario no conectado')
  })

  it('pinta días de stock crítico en rojo y riesgo en ámbar', () => {
    const { html } = armarInformeDiario(datosBase({
      ventas: {
        propia: { ordenes: 5, monto: 500 }, terceros: { ordenes: 0, monto: 0 },
        modelos: [
          { modelo: 'Moto G06', unidades: 3, diasStock: 8, aComprarMin: 10, aComprarMax: 18 },
          { modelo: 'Galaxy A07', unidades: 2, diasStock: 12, aComprarMin: 5, aComprarMax: 5 },
        ],
      },
    }))
    expect(html).toContain('#dc2626')
    expect(html).toContain('#d97706')
    expect(html).toContain('10–18')
    expect(html).toMatch(/5\s?u\./)
  })

  it('caja: negativo en rojo y mínimo en negrita; texto plano no vacío', () => {
    const { html, texto } = armarInformeDiario(datosBase({
      caja: [
        { fecha: '2026-11-19', saldo: 5000000 },
        { fecha: '2026-11-20', saldo: -200000 },
        { fecha: '2026-11-21', saldo: 3000000 },
      ],
    }))
    expect(html).toContain('#dc2626')
    expect(html).toContain('<strong')
    expect(texto.length).toBeGreaterThan(10)
  })
})

// --- hallazgos del dry-run 19/11 ---

import { unificarModelosVendidos } from '@/lib/informe-diario'

describe('rangoAComprar en el HTML (formato)', () => {
  it('redondea hacia arriba y formatea miles es-AR', () => {
    const datos = datosBase()
    datos.ventas = {
      propia: { ordenes: 1, monto: 100 }, terceros: { ordenes: 0, monto: 0 },
      modelos: [{ modelo: 'Samsung Galaxy A07 64GB', unidades: 52, diasStock: 9, aComprarMin: 3791.8330654140623, aComprarMax: 4006.683205221848 }],
    }
    const { html } = armarInformeDiario(datos)
    expect(html).toContain('3.792–4.007 u.')
    expect(html).not.toContain('3791.83')
  })

  it('tras redondear, si coinciden muestra un solo número', () => {
    const datos = datosBase()
    datos.ventas = {
      propia: { ordenes: 1, monto: 100 }, terceros: { ordenes: 0, monto: 0 },
      modelos: [{ modelo: 'X', unidades: 1, diasStock: 20, aComprarMin: 11.2, aComprarMax: 11.9 }],
    }
    const { html } = armarInformeDiario(datos)
    expect(html).toContain('12 u.')
    expect(html).not.toContain('12–12')
  })
})

describe('unificarModelosVendidos', () => {
  it('une el nombre de devices sin marca/capacidad con la única variante de la tienda', () => {
    const r = unificarModelosVendidos([
      { modelo: 'Moto G06', unidades: 13 },
      { modelo: 'Motorola Moto G06 64GB', unidades: 11 },
    ])
    expect(r).toEqual([{ modelo: 'Motorola Moto G06 64GB', unidades: 24 }])
  })

  it('con dos capacidades posibles no adivina', () => {
    const r = unificarModelosVendidos([
      { modelo: 'Samsung Galaxy A16', unidades: 5 },
      { modelo: 'Samsung Galaxy A16 4/128GB', unidades: 3 },
      { modelo: 'Samsung Galaxy A16 8/256GB', unidades: 2 },
    ])
    expect(r.length).toBe(3)
  })

  it('no fusiona modelos distintos (Edge 60 vs Edge 60 Fusion)', () => {
    const r = unificarModelosVendidos([
      { modelo: 'Motorola Edge 60', unidades: 2 },
      { modelo: 'Motorola Edge 60 Fusion 256GB', unidades: 4 },
    ])
    expect(r.length).toBe(2)
  })

  it('tolera la ausencia del token Galaxy', () => {
    const r = unificarModelosVendidos([
      { modelo: 'Samsung A07 64GB', unidades: 1 },
      { modelo: 'Samsung Galaxy A07 64GB', unidades: 2 },
    ])
    expect(r).toEqual([{ modelo: 'Samsung Galaxy A07 64GB', unidades: 3 }])
  })
})

// --- fixes del review final (19/11) ---

import { diaArt, fechasInforme, resumenDeposito, todosDelDia } from '@/lib/informe-diario'

describe('diaArt', () => {
  it('convierte un timestamp UTC al día calendario ART', () => {
    expect(diaArt('2026-11-19T01:15:00+00:00')).toBe('2026-11-18')
  })
  it('respeta timestamps que ya vienen con offset ART', () => {
    expect(diaArt('2026-11-18T23:59:00-03:00')).toBe('2026-11-18')
  })
  it('deja intactas las fechas sin hora', () => {
    expect(diaArt('2026-11-18')).toBe('2026-11-18')
  })
})

describe('fechasInforme', () => {
  it('sin fecha: todo es hoy real', () => {
    expect(fechasInforme(undefined, '2026-11-19')).toEqual({ fecha: '2026-11-19', ayer: '2026-11-18', hoy: '2026-11-19' })
  })
  it('con fecha: desplaza solo el eje "ayer"; los bloques vivos siguen en hoy real', () => {
    expect(fechasInforme('2026-10-01', '2026-11-19')).toEqual({ fecha: '2026-10-01', ayer: '2026-09-30', hoy: '2026-11-19' })
  })
  it('fecha inválida se ignora', () => {
    expect(fechasInforme('2026-1-5', '2026-11-19')).toEqual({ fecha: '2026-11-19', ayer: '2026-11-18', hoy: '2026-11-19' })
  })
})

describe('resumenDeposito', () => {
  it('foto viva del snapshot + flujos del día del informe (como la tarjeta Warehouse)', () => {
    const r = resumenDeposito({
      snapshot: { enCola: 41, enColaVencidos: 2, pendientesPicking: 17, pickingAtascados: 1 },
      dia: { ingresados: 50, enviados: 48, pickeados: 60, expedidos: 68 },
      requierenAtencion: 6,
      demoras: [
        { ref: 'A', dias: 4 }, { ref: 'B', dias: 9 }, { ref: 'C', dias: 2 },
        { ref: 'D', dias: 7 }, { ref: 'E', dias: 5 }, { ref: 'F', dias: 1 },
      ],
      arrepentimientosAbiertos: 2,
      arrepentimientosAyer: 1,
      pendientesRegreso: 4,
    })
    expect(r.enCola).toBe(41)
    expect(r.enColaVencidos).toBe(2)
    expect(r.pendientesPicking).toBe(17)
    expect(r.pickingAtascados).toBe(1)
    expect(r.dia).toEqual({ ingresados: 50, enviados: 48, pickeados: 60, expedidos: 68 })
    expect(r.requierenAtencion).toBe(6)
    expect(r.demorados.cantidad).toBe(6)
    expect(r.demorados.peores.map(p => p.dias)).toEqual([9, 7, 5, 4, 2])
  })
})

describe('render del depósito estilo tarjeta Warehouse', () => {
  it('muestra las 3 columnas con foto viva, vencidos/atascados y los flujos del día', () => {
    const datos = datosBase()
    datos.deposito = {
      enCola: 41, enColaVencidos: 2, pendientesPicking: 17, pickingAtascados: 1,
      dia: { ingresados: 50, enviados: 48, pickeados: 60, expedidos: 68 },
      requierenAtencion: 6,
      demorados: { cantidad: 0, peores: [] },
      arrepentimientosAbiertos: 1, arrepentimientosAyer: 0, pendientesRegreso: 2,
    }
    const { html } = armarInformeDiario(datos)
    expect(html).toContain('En cola')
    expect(html).toContain('pendientes de Picking')
    expect(html).toContain('41')
    expect(html).toContain('17')
    expect(html).toMatch(/2[^<]*vencid/i)
    expect(html).toMatch(/1[^<]*atascad/i)
    expect(html).toContain('Expedidos')
    expect(html).toContain('68')
  })

  it('sin vencidos ni atascados no muestra advertencias', () => {
    const datos = datosBase()
    datos.deposito = {
      enCola: 5, enColaVencidos: 0, pendientesPicking: 3, pickingAtascados: 0,
      dia: { ingresados: 1, enviados: 2, pickeados: 3, expedidos: 4 },
      requierenAtencion: 0,
      demorados: { cantidad: 0, peores: [] },
      arrepentimientosAbiertos: 0, arrepentimientosAyer: 0, pendientesRegreso: 0,
    }
    const { html } = armarInformeDiario(datos)
    expect(html).not.toMatch(/vencid/i)
    expect(html).not.toMatch(/atascad/i)
  })
})

describe('todosDelDia', () => {
  it('trae SOLO los ToDos pendientes del día, urgentes primero', () => {
    const raw = {
      '2026-04-30': [{ id: '1', text: 'Vencido viejo', done: false }],
      '2026-11-19': [
        { id: '2', text: 'Normal de hoy', done: false },
        { id: '3', text: 'Urgente de hoy', done: false, prioridad: 'urgente' },
        { id: '4', text: 'Ya hecho', done: true },
      ],
      '2026-11-25': [{ id: '5', text: 'Futuro', done: false }],
    }
    const r = todosDelDia(raw, '2026-11-19')
    expect(r.map(t => t.texto)).toEqual(['Urgente de hoy', 'Normal de hoy'])
    expect(r[0].urgente).toBe(true)
  })
})

describe('layout del mail', () => {
  it('ocupa todo el ancho (sin max-width de 680px)', () => {
    const { html } = armarInformeDiario(datosBase())
    expect(html).not.toContain('max-width:680px')
    expect(html).toMatch(/width:100%/)
  })

  it('la columna de compras dice resto del mes', () => {
    const datos = datosBase()
    datos.ventas = {
      propia: { ordenes: 1, monto: 100 }, terceros: { ordenes: 0, monto: 0 },
      modelos: [{ modelo: 'X', unidades: 1, diasStock: 20, aComprarMin: 3, aComprarMax: 5 }],
    }
    const { html } = armarInformeDiario(datos)
    expect(html).toContain('resto del mes')
  })
})

describe('render de PD sin denominador', () => {
  it('celda con denominador 0 muestra — en vez de 0.0%', () => {
    const datos = datosBase()
    datos.pd = {
      celdas: [
        celda('2026-09', 2), celda('2026-09', 3),
        { mes: '2026-09', cuota: 4, pdHard: 0, pd30: 0, denHard: 0, den30: 0 },
      ],
      meses: ['2026-09'],
      nota: 'C4 aún sin datos suficientes.',
    }
    const { html } = armarInformeDiario(datos)
    expect(html).not.toContain('0.0% / 0.0%')
    expect(html).toContain('—')
  })
})

describe('escape de HTML en datos externos', () => {
  it('escapa títulos de eventos de calendar y textos de ToDos', () => {
    const datos = datosBase()
    datos.agenda = {
      todos: [{ texto: 'Revisar <b>算</b> & co', fecha: '2026-11-19', urgente: false }],
      eventos: [{ titulo: '<script>alert(1)</script>', horaInicio: '10:00', horaFin: '11:00' }],
    }
    const { html } = armarInformeDiario(datos)
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('Revisar &lt;b&gt;')
  })

  it('escapa nombres de modelo', () => {
    const datos = datosBase()
    datos.ventas = {
      propia: { ordenes: 1, monto: 100 }, terceros: { ordenes: 0, monto: 0 },
      modelos: [{ modelo: 'Moto <G06> & Max', unidades: 1, diasStock: null, aComprarMin: null, aComprarMax: null }],
    }
    const { html } = armarInformeDiario(datos)
    expect(html).toContain('Moto &lt;G06&gt; &amp; Max')
  })
})
