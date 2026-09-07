import { describe, it, expect } from 'vitest'
import { aDiaHabilSiguiente, esFinde, letraDia } from '@/lib/dias-habiles'

// Referencia: 2026-09-05 es sábado, 2026-09-06 domingo, 2026-09-07 lunes

describe('aDiaHabilSiguiente', () => {
  it('sábado pasa al lunes', () => {
    expect(aDiaHabilSiguiente('2026-09-05')).toBe('2026-09-07')
  })

  it('domingo pasa al lunes', () => {
    expect(aDiaHabilSiguiente('2026-09-06')).toBe('2026-09-07')
  })

  it('un día hábil queda igual', () => {
    expect(aDiaHabilSiguiente('2026-09-07')).toBe('2026-09-07')
    expect(aDiaHabilSiguiente('2026-09-11')).toBe('2026-09-11') // viernes
  })

  it('cruza el fin de mes sin romperse', () => {
    expect(aDiaHabilSiguiente('2026-10-31')).toBe('2026-11-02') // sábado → lunes
  })
})

describe('esFinde / letraDia', () => {
  it('detecta el finde y devuelve la letra correcta de cada día', () => {
    const semana = ['2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11', '2026-09-12', '2026-09-13']
    expect(semana.map(letraDia)).toEqual(['L', 'M', 'M', 'J', 'V', 'S', 'D'])
    expect(semana.map(esFinde)).toEqual([false, false, false, false, false, true, true])
  })
})
