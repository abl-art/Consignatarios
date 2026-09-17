import { describe, it, expect } from 'vitest'
import { clasificarCortes, descomponerModelos, netoPorModelo, type ModeloNeto } from '@/lib/control-stock'

const fila = (nombre: string, and: number, go: number, env = 0, medido = true, andTotal = and) => ({
  nombre,
  and_total: andTotal,
  and_disponible: and,
  go_andreani: go,
  go_enviados: env,
  medido,
})

describe('netoPorModelo', () => {
  it('compensa color-SKUs del mismo modelo: stock cruzado de color no es faltante', () => {
    // Caso real G06: un color con −55 y otro con +50 → neto −5
    const r = netoPorModelo(
      [fila('Moto G06', 74, 129), fila('Moto G06', 50, 0)],
      [],
    )
    expect(r).toEqual([
      { nombre: 'Moto G06', skus: 2, andTotal: 124, andDisponible: 124, goComparable: 129, dif: -5, enCola: 0, disponibleReal: 124 },
    ])
  })

  it('NO descuenta los enviados sin pickear: Andreani tampoco resta esa cola', () => {
    // Andreani reporta 44 disponible (no descuenta la cola de 12 no pickeados),
    // GO tiene 44 available → cierra en 0. Restar la cola daría un +12 falso.
    const r = netoPorModelo([fila('Moto G17', 44, 44, 12)], [])
    expect(r[0]).toMatchObject({ goComparable: 44, dif: 0 })
  })

  it('los despachos sin IMEI (GO infla available) quedan como dif negativa real', () => {
    // Andreani despachó 2 sin informar serie: su disponible baja a 42, GO sigue
    // con 44 available → dif −2, el faltante real a reclamar.
    const r = netoPorModelo([fila('Moto G17', 42, 44, 12)], [])
    expect(r[0]).toMatchObject({ goComparable: 44, dif: -2 })
  })

  it('el vendido en cola define el disponible real sin tocar la diferencia', () => {
    const r = netoPorModelo([fila('Moto G17', 40, 40)], [{ nombre: 'Moto G17', unidades: 7 }])
    expect(r[0]).toMatchObject({ dif: 0, enCola: 7, disponibleReal: 33 })
  })

  it('ignora filas sin medir y ordena por diferencia absoluta', () => {
    const r = netoPorModelo(
      [fila('A', 10, 10), fila('B', 5, 15), fila('C', 0, 99, 0, false)],
      [],
    )
    expect(r.map(m => m.nombre)).toEqual(['B', 'A'])
  })
})

const neto = (nombre: string, o: { andTotal: number; andDisponible: number; goComparable: number }): ModeloNeto => ({
  nombre,
  skus: 1,
  andTotal: o.andTotal,
  andDisponible: o.andDisponible,
  goComparable: o.goComparable,
  dif: o.andDisponible - o.goComparable,
  enCola: 0,
  disponibleReal: o.andDisponible,
})

describe('descomponerModelos', () => {
  it('una diferencia positiva (Andreani cuenta de más) va entera al residual', () => {
    // Reingreso de rescate no registrado en GO: nada de fantasma/putaway.
    const r = descomponerModelos([neto('G06 64', { andTotal: 228, andDisponible: 227, goComparable: 221 })], new Map(), new Map())
    expect(r[0]).toMatchObject({ dif: 6, fantasmas: 0, putaway: 0, residual: 6 })
  })

  it('un fantasma conocido explica la dif negativa → residual 0', () => {
    const r = descomponerModelos([neto('Nubia', { andTotal: 68, andDisponible: 68, goComparable: 69 })], new Map([['Nubia', 1]]), new Map())
    expect(r[0]).toMatchObject({ dif: -1, fantasmas: 1, putaway: 0, residual: 0 })
  })

  it('CAP: nunca explica más que la dif (sobran fantasmas = ya se resolvieron)', () => {
    // 2 fantasmas listados pero la dif es solo −1 → uno ya se resolvió, residual 0 (no +1)
    const r = descomponerModelos([neto('A17', { andTotal: 92, andDisponible: 92, goComparable: 93 })], new Map([['A17', 2]]), new Map())
    expect(r[0]).toMatchObject({ dif: -1, fantasmas: 1, putaway: 0, residual: 0 })
  })

  it('putaway: GO cuenta más que el total de Andreani, respaldado por recepción → residual 0', () => {
    // Recibimos 50 que Andreani no ingresó a su total (10) todavía; recepción 48h las cubre
    const r = descomponerModelos([neto('G17 128', { andTotal: 10, andDisponible: 10, goComparable: 60 })], new Map(), new Map([['G17 128', 50]]))
    expect(r[0]).toMatchObject({ dif: -50, fantasmas: 0, putaway: 50, residual: 0 })
  })

  it('el putaway se acota por la recepción 48h: lo que sobra queda como residual real', () => {
    // Exceso de 50 pero solo 30 de recepción reciente → 20 sin explicar
    const r = descomponerModelos([neto('G17 128', { andTotal: 10, andDisponible: 10, goComparable: 60 })], new Map(), new Map([['G17 128', 30]]))
    expect(r[0]).toMatchObject({ dif: -50, fantasmas: 0, putaway: 30, residual: -20 })
  })

  it('imputa primero fantasmas y después putaway, sin contar doble el exceso', () => {
    // dif −5: 3 fantasmas conocidos + 2 de putaway (recepción cubre) → residual 0
    const r = descomponerModelos([neto('G06 128', { andTotal: 10, andDisponible: 10, goComparable: 15 })], new Map([['G06 128', 3]]), new Map([['G06 128', 10]]))
    expect(r[0]).toMatchObject({ dif: -5, fantasmas: 3, putaway: 2, residual: 0 })
  })

  it('sin recepción, un exceso sobre el total de Andreani NO se atribuye a putaway', () => {
    // GO cuenta 3 más que el total pero no hubo recepción reciente → todo residual
    const r = descomponerModelos([neto('Note 14', { andTotal: 3, andDisponible: 3, goComparable: 6 })], new Map([['Note 14', 1]]), new Map())
    expect(r[0]).toMatchObject({ dif: -3, fantasmas: 1, putaway: 0, residual: -2 })
  })
})

const modelo = (nombre: string, residual: number): ModeloNeto & { fantasmas: number; putaway: number; residual: number } => ({
  nombre,
  skus: 1,
  andTotal: 10,
  andDisponible: 10,
  goComparable: 10 - residual,
  dif: residual,
  enCola: 0,
  disponibleReal: 10,
  fantasmas: 0,
  putaway: 0,
  residual,
})

const corte = (runAt: string, modelos: ReturnType<typeof modelo>[], recepciones: { nombre: string; unidades: number }[] = []) => ({
  runAt,
  modelos,
  recepciones,
})

describe('clasificarCortes', () => {
  it('un residual que aparece en el último corte sin historia es nuevo — a confirmar', () => {
    const r = clasificarCortes([corte('2026-09-16T18:44:00Z', [modelo('G06', -3)])])
    expect(r).toEqual([
      {
        runAt: '2026-09-16T18:44:00Z',
        difs: [{ nombre: 'G06', dif: -3, fantasmas: 0, putaway: 0, residual: -3, estado: 'nueva', desde: '2026-09-16T18:44:00Z', cortes: 1, recepcion48h: 0 }],
      },
    ])
  })

  it('un residual del mismo signo que sobrevive 2 cortes consecutivos es real, racha desde el primero', () => {
    const r = clasificarCortes([
      corte('2026-09-17T00:44:00Z', [modelo('G06', -3)]),
      corte('2026-09-17T06:44:00Z', [modelo('G06', -4)]),
    ])
    expect(r[1].difs[0]).toMatchObject({ nombre: 'G06', residual: -4, estado: 'real', desde: '2026-09-17T00:44:00Z', cortes: 2 })
    expect(r[0].difs[0].estado).toBe('persistia')
  })

  it('un residual que desaparece en el corte siguiente queda resuelto (era lag)', () => {
    const r = clasificarCortes([
      corte('2026-09-17T00:44:00Z', [modelo('G06', -3)]),
      corte('2026-09-17T06:44:00Z', [modelo('G06', 0)]),
    ])
    expect(r[0].difs[0].estado).toBe('resuelta')
    expect(r[1].difs).toEqual([])
  })

  it('un modelo con dif cruda pero residual 0 (todo explicado) no aparece como diferencia', () => {
    const explicado = { ...modelo('G06', 0), dif: -53, putaway: 53 }
    const r = clasificarCortes([corte('2026-09-17T12:44:00Z', [explicado])])
    expect(r[0].difs).toEqual([])
  })

  it('un cambio de signo del residual corta la racha: arranca como nuevo', () => {
    const r = clasificarCortes([
      corte('2026-09-17T00:44:00Z', [modelo('G06', -3)]),
      corte('2026-09-17T06:44:00Z', [modelo('G06', 2)]),
    ])
    expect(r[0].difs[0].estado).toBe('resuelta')
    expect(r[1].difs[0]).toMatchObject({ estado: 'nueva', cortes: 1, desde: '2026-09-17T06:44:00Z' })
  })

  it('adjunta las recepciones 48h del corte como contexto', () => {
    const r = clasificarCortes([
      corte('2026-09-17T00:44:00Z', [modelo('Redmi 14C', -8)], [{ nombre: 'Redmi 14C', unidades: 120 }]),
    ])
    expect(r[0].difs[0].recepcion48h).toBe(120)
  })

  it('acepta los cortes en cualquier orden y los devuelve ascendentes por runAt', () => {
    const r = clasificarCortes([
      corte('2026-09-17T06:44:00Z', [modelo('G06', -4)]),
      corte('2026-09-17T00:44:00Z', [modelo('G06', -3)]),
    ])
    expect(r.map(c => c.runAt)).toEqual(['2026-09-17T00:44:00Z', '2026-09-17T06:44:00Z'])
    expect(r[1].difs[0].estado).toBe('real')
  })
})
