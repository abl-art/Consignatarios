import { describe, it, expect } from 'vitest'
import { resumenAccesorios } from '@/lib/accesorios'

describe('resumenAccesorios', () => {
  it('calcula el porcentaje con un decimal y el monto desde centavos', () => {
    const r = resumenAccesorios({ ordenes: 4045, conAccesorios: 434, montoCentavos: 2051010000 })
    expect(r.pct).toBe(10.7)
    expect(r.monto).toBe(20510100)
    expect(r.ordenes).toBe(4045)
    expect(r.conAccesorios).toBe(434)
  })

  it('sin órdenes no divide por cero', () => {
    const r = resumenAccesorios({ ordenes: 0, conAccesorios: 0, montoCentavos: 0 })
    expect(r.pct).toBe(0)
    expect(r.monto).toBe(0)
  })

  it('redondea el porcentaje, no lo trunca', () => {
    const r = resumenAccesorios({ ordenes: 1000, conAccesorios: 157, montoCentavos: 0 })
    expect(r.pct).toBe(15.7)
    expect(resumenAccesorios({ ordenes: 3, conAccesorios: 1, montoCentavos: 0 }).pct).toBe(33.3)
  })
})
