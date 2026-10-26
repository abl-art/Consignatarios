import { describe, it, expect } from 'vitest'
import { normalizarTac, evaluarTac } from '@/lib/catalogo-tac'

describe('normalizarTac', () => {
  it('acepta el TAC solo y el IMEI completo', () => {
    expect(normalizarTac('35225187')).toBe('35225187')
    expect(normalizarTac('352251873069618')).toBe('35225187')
  })

  it('limpia puntos, espacios y guiones', () => {
    expect(normalizarTac(' 35.22.51-87 ')).toBe('35225187')
    expect(normalizarTac('35 2251 8730 69618')).toBe('35225187')
  })

  it('menos de 8 dígitos no identifica un TAC', () => {
    expect(normalizarTac('3522518')).toBeNull()
    expect(normalizarTac('abc')).toBeNull()
    expect(normalizarTac('')).toBeNull()
  })
})

describe('evaluarTac', () => {
  it('con equipos activos/bloqueados/liberados/ready el TAC se puede vender', () => {
    for (const status of ['ready_for_use', 'active', 'locked', 'released']) {
      const r = evaluarTac({ estados: [{ status, count: 5 }], enListaNegra: false })
      expect(r.vendible).toBe(true)
      expect(r.motivo).toBe('ok')
      expect(r.equiposOk).toBe(5)
    }
  })

  it('estados mezclados: alcanza con uno operable y suma solo esos', () => {
    const r = evaluarTac({
      estados: [{ status: 'idle', count: 10 }, { status: 'active', count: 3 }, { status: 'locked', count: 2 }],
      enListaNegra: false,
    })
    expect(r.vendible).toBe(true)
    expect(r.equiposOk).toBe(5)
  })

  it('solo pendiente/inactivo no alcanza', () => {
    const r = evaluarTac({ estados: [{ status: 'idle', count: 4 }, { status: 'returned', count: 1 }], enListaNegra: false })
    expect(r.vendible).toBe(false)
    expect(r.motivo).toBe('sin_estados_validos')
  })

  it('la lista negra de Trustonic manda aunque haya equipos activos', () => {
    const r = evaluarTac({ estados: [{ status: 'active', count: 2 }], enListaNegra: true })
    expect(r.vendible).toBe(false)
    expect(r.motivo).toBe('lista_negra')
  })

  it('TAC nunca visto: desconocido', () => {
    const r = evaluarTac({ estados: [], enListaNegra: false })
    expect(r.vendible).toBe(false)
    expect(r.motivo).toBe('desconocido')
  })
})
