import { describe, it, expect } from 'vitest'
import { fechaAIso, isoAFecha, filtrarNotas } from '@/lib/notas-pedido-filtros'

describe('fechaAIso / isoAFecha', () => {
  it('convierte el formato D/M/YYYY del gestor a ISO', () => {
    expect(fechaAIso('24/11/2026')).toBe('2026-11-24')
    expect(fechaAIso('5/8/2026')).toBe('2026-08-05')
  })

  it('vuelve de ISO al formato del gestor sin ceros a la izquierda', () => {
    expect(isoAFecha('2026-11-24')).toBe('24/11/2026')
    expect(isoAFecha('2026-08-05')).toBe('5/8/2026')
  })

  it('fecha rota devuelve vacío en vez de romper', () => {
    expect(fechaAIso('sin fecha')).toBe('')
    expect(isoAFecha('')).toBe('')
  })
})

describe('filtrarNotas', () => {
  const nota = (id: string, provId: string, fecha: string) => ({ id, proveedor: { id: provId }, fecha })
  const notas = [
    nota('a', 'syna', '20/11/2026'),
    nota('b', 'newsan', '22/11/2026'),
    nota('c', 'syna', '24/11/2026'),
  ]

  it('sin filtros devuelve todo', () => {
    expect(filtrarNotas(notas, {}).map(n => n.id)).toEqual(['a', 'b', 'c'])
  })

  it('filtra por proveedor', () => {
    expect(filtrarNotas(notas, { proveedorId: 'syna' }).map(n => n.id)).toEqual(['a', 'c'])
  })

  it('filtra por rango de fechas inclusive', () => {
    expect(filtrarNotas(notas, { desde: '2026-11-22', hasta: '2026-11-24' }).map(n => n.id)).toEqual(['b', 'c'])
  })

  it('combina proveedor y fecha', () => {
    expect(filtrarNotas(notas, { proveedorId: 'syna', desde: '2026-11-21' }).map(n => n.id)).toEqual(['c'])
  })

  it('solo desde o solo hasta también funcionan', () => {
    expect(filtrarNotas(notas, { desde: '2026-11-23' }).map(n => n.id)).toEqual(['c'])
    expect(filtrarNotas(notas, { hasta: '2026-11-20' }).map(n => n.id)).toEqual(['a'])
  })
})
