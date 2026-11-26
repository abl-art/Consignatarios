import { describe, it, expect } from 'vitest'
import { normalizarScan, compararLectura, textoNovedadDiferencias } from '@/lib/asn-control'

describe('normalizarScan', () => {
  it('limpia espacios, guiones y case', () => {
    expect(normalizarScan(' 356996-511077454 ')).toBe('356996511077454')
    expect(normalizarScan('abc123\n')).toBe('ABC123')
  })
})

describe('compararLectura', () => {
  const esperados = ['111', '222', '333']
  it('todo escaneado: sin faltantes ni sobrantes', () => {
    const r = compararLectura(esperados, ['111', '222', '333'])
    expect(r.ok).toHaveLength(3)
    expect(r.faltantes).toHaveLength(0)
    expect(r.sobrantes).toHaveLength(0)
  })
  it('detecta faltantes y sobrantes, con dedup', () => {
    const r = compararLectura(esperados, ['111', '111'], ['999', '999'])
    expect(r.ok).toEqual(['111'])
    expect(r.faltantes.sort()).toEqual(['222', '333'])
    expect(r.sobrantes).toEqual(['999'])
  })
  it('un sobrante que en realidad era esperado no se duplica como sobrante', () => {
    const r = compararLectura(esperados, ['111'], ['222'])
    expect(r.sobrantes).toHaveLength(0)
  })
  it('normaliza antes de comparar', () => {
    const r = compararLectura(['356996511077454'], [' 356996-511077454 '])
    expect(r.ok).toHaveLength(1)
    expect(r.faltantes).toHaveLength(0)
  })
})

describe('textoNovedadDiferencias', () => {
  it('arma titulo y detalle con faltantes, sobrantes y nota', () => {
    const t = textoNovedadDiferencias('17619593', { ok: ['1'], faltantes: ['2', '3'], sobrantes: ['9'] }, 'caja mojada')
    expect(t.titulo).toContain('17619593')
    expect(t.titulo).toContain('2 faltante')
    expect(t.detalle).toContain('FALTANTES (no escaneados): 2, 3')
    expect(t.detalle).toContain('SOBRANTES')
    expect(t.detalle).toContain('caja mojada')
  })
})
