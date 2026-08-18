import { describe, it, expect, vi, afterEach } from 'vitest'
import { diasDesde, DIAS_TRANSITO_TRABADO } from '@/lib/transito'

describe('diasDesde', () => {
  afterEach(() => vi.useRealTimers())

  it('cuenta los días completos desde una fecha ISO', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-18T12:00:00Z'))
    expect(diasDesde('2026-08-08T12:00:00Z')).toBe(10)
    expect(diasDesde('2026-08-18T00:00:00Z')).toBe(0)
  })

  it('el umbral de trabado es 10 días', () => {
    expect(DIAS_TRANSITO_TRABADO).toBe(10)
  })
})
