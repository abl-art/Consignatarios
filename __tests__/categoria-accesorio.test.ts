import { describe, it, expect } from 'vitest'
import { categoriaAccesorio } from '@/lib/categoria-accesorio'

describe('categoriaAccesorio', () => {
  it('los SKU KS-* son kits', () => {
    expect(categoriaAccesorio('KS-MOTO-G56', 'Kit Seguridad Moto G56')).toBe('kit')
  })

  it('detecta auriculares por nombre', () => {
    expect(categoriaAccesorio('BHR8776GL', 'Auriculares Redmi Buds 6 Play')).toBe('auricular')
  })

  it('JBL cuenta como parlante aunque el nombre no lo diga', () => {
    expect(categoriaAccesorio('JBLGOESBLKAM', 'JBL Go Essential')).toBe('parlante')
  })

  it('detecta smartwatches por nombre', () => {
    expect(categoriaAccesorio('BHR9444GL', 'Xiaomi Smart Band 9 Active')).toBe('smartwatch')
  })

  it('lo que no matchea queda como otro', () => {
    expect(categoriaAccesorio('XYZ', 'Cargador 30W')).toBe('otro')
  })
})
