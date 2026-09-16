import { describe, it, expect } from 'vitest'
import { clasificarCortes, netoPorModelo, type ModeloNeto } from '@/lib/control-stock'

const fila = (nombre: string, and: number, go: number, env = 0, medido = true) => ({
  nombre,
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
      { nombre: 'Moto G06', skus: 2, andDisponible: 124, goComparable: 129, dif: -5, enCola: 0, disponibleReal: 124 },
    ])
  })

  it('descuenta los enviados sin pickear del lado GO (Andreani ya los restó)', () => {
    const r = netoPorModelo([fila('Moto G17', 32, 44, 12)], [])
    expect(r[0]).toMatchObject({ goComparable: 32, dif: 0 })
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

const modelo = (nombre: string, dif: number): ModeloNeto => ({
  nombre,
  skus: 1,
  andDisponible: 10,
  goComparable: 10 - dif,
  dif,
  enCola: 0,
  disponibleReal: 10,
})

const corte = (runAt: string, modelos: ModeloNeto[], recepciones: { nombre: string; unidades: number }[] = []) => ({
  runAt,
  modelos,
  recepciones,
})

describe('clasificarCortes', () => {
  it('una dif que aparece en el último corte sin historia es nueva — a confirmar', () => {
    const r = clasificarCortes([corte('2026-09-16T18:44:00Z', [modelo('G06', -3)])])
    expect(r).toEqual([
      {
        runAt: '2026-09-16T18:44:00Z',
        difs: [{ nombre: 'G06', dif: -3, estado: 'nueva', desde: '2026-09-16T18:44:00Z', cortes: 1, recepcion48h: 0 }],
      },
    ])
  })

  it('una dif del mismo signo que sobrevive 2 cortes consecutivos es real, con racha desde el primero', () => {
    const r = clasificarCortes([
      corte('2026-09-17T00:44:00Z', [modelo('G06', -3)]),
      corte('2026-09-17T06:44:00Z', [modelo('G06', -4)]),
    ])
    expect(r[1].difs[0]).toEqual({
      nombre: 'G06', dif: -4, estado: 'real', desde: '2026-09-17T00:44:00Z', cortes: 2, recepcion48h: 0,
    })
    expect(r[0].difs[0].estado).toBe('persistia')
  })

  it('una dif que desaparece en el corte siguiente queda resuelta (fue timing)', () => {
    const r = clasificarCortes([
      corte('2026-09-17T00:44:00Z', [modelo('G06', -3)]),
      corte('2026-09-17T06:44:00Z', [modelo('G06', 0)]),
    ])
    expect(r[0].difs[0].estado).toBe('resuelta')
    expect(r[1].difs).toEqual([])
  })

  it('un cambio de signo corta la racha: es otro fenómeno, arranca como nueva', () => {
    const r = clasificarCortes([
      corte('2026-09-17T00:44:00Z', [modelo('G06', -3)]),
      corte('2026-09-17T06:44:00Z', [modelo('G06', 2)]),
    ])
    expect(r[0].difs[0].estado).toBe('resuelta')
    expect(r[1].difs[0]).toMatchObject({ estado: 'nueva', cortes: 1, desde: '2026-09-17T06:44:00Z' })
  })

  it('un corte intermedio sin la dif corta la racha aunque reaparezca', () => {
    const r = clasificarCortes([
      corte('2026-09-17T00:44:00Z', [modelo('G06', -3)]),
      corte('2026-09-17T06:44:00Z', [modelo('G06', 0)]),
      corte('2026-09-17T12:44:00Z', [modelo('G06', -2)]),
    ])
    expect(r[2].difs[0]).toMatchObject({ estado: 'nueva', cortes: 1, desde: '2026-09-17T12:44:00Z' })
  })

  it('adjunta las recepciones 48h del corte como contexto de putaway', () => {
    const r = clasificarCortes([
      corte('2026-09-17T00:44:00Z', [modelo('Redmi 14C', -98)], [{ nombre: 'Redmi 14C', unidades: 120 }]),
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
