import { describe, it, expect } from 'vitest'
import { validarSelect, serializarFilas } from '@/lib/celia/sql'

describe('validarSelect', () => {
  it('acepta un SELECT simple', () => {
    expect(validarSelect('SELECT * FROM ventas').ok).toBe(true)
  })
  it('acepta un WITH (CTE) de lectura', () => {
    expect(validarSelect('WITH x AS (SELECT 1) SELECT * FROM x').ok).toBe(true)
  })
  it('acepta punto y coma final y comentarios', () => {
    expect(validarSelect('-- hola\nSELECT 1;').ok).toBe(true)
  })
  it('rechaza UPDATE', () => {
    expect(validarSelect("UPDATE ventas SET monto = 0").ok).toBe(false)
  })
  it('rechaza DELETE/DROP/INSERT/TRUNCATE/ALTER', () => {
    for (const sql of ['DELETE FROM x', 'DROP TABLE x', "INSERT INTO x VALUES (1)", 'TRUNCATE x', 'ALTER TABLE x ADD y int']) {
      expect(validarSelect(sql).ok).toBe(false)
    }
  })
  it('rechaza multiples sentencias', () => {
    expect(validarSelect('SELECT 1; SELECT 2').ok).toBe(false)
  })
  it('rechaza CTE con delete escondido', () => {
    expect(validarSelect('WITH x AS (DELETE FROM ventas RETURNING *) SELECT * FROM x').ok).toBe(false)
  })
  it('no confunde offset con set', () => {
    expect(validarSelect('SELECT * FROM ventas LIMIT 10 OFFSET 5').ok).toBe(true)
  })
})

describe('serializarFilas', () => {
  it('serializa Date y BigInt sin explotar', () => {
    const out = serializarFilas([{ f: new Date('2026-01-01T00:00:00Z'), n: BigInt('9007199254740993') }])
    expect(out).toContain('2026-01-01')
    expect(out).toContain('9007199254740993')
  })
})
