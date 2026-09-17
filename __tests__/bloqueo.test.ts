import { describe, it, expect } from 'vitest'
import { sqlFiltrosIndicadores, BLOQUEOS } from '@/lib/bloqueo'

describe('sqlFiltrosIndicadores', () => {
  it('sin filtros no agrega nada', () => {
    expect(sqlFiltrosIndicadores()).toEqual({ join: '', where: '' })
    expect(sqlFiltrosIndicadores({})).toEqual({ join: '', where: '' })
  })

  it('knox filtra marcas Samsung (incluye variantes de casing y "Samsung Korea")', () => {
    const { join, where } = sqlFiltrosIndicadores({ bloqueo: 'knox' })
    expect(join).toContain('FROM devices')
    expect(join).toContain('marca_dev.order_id = o.order_id::text')
    expect(where).toContain("marca_dev.brand ILIKE 'samsung%'")
  })

  it('motosafe filtra Motorola', () => {
    const { where } = sqlFiltrosIndicadores({ bloqueo: 'motosafe' })
    expect(where).toContain("marca_dev.brand ILIKE 'motorola%'")
  })

  it('dlc es el resto de las marcas conocidas: excluye Samsung, Motorola y sin marca', () => {
    const { where } = sqlFiltrosIndicadores({ bloqueo: 'dlc' })
    expect(where).toContain('marca_dev.brand IS NOT NULL')
    expect(where).toContain("NOT ILIKE 'samsung%'")
    expect(where).toContain("NOT ILIKE 'motorola%'")
  })

  it('un bloqueo desconocido no genera SQL', () => {
    // el valor llega del cliente: si no está en la whitelist, se ignora
    const res = sqlFiltrosIndicadores({ bloqueo: "x'; DROP TABLE devices; --" as never })
    expect(res).toEqual({ join: '', where: '' })
  })

  it('storeIds se sanitizan a numéricos y arman el IN', () => {
    const { where } = sqlFiltrosIndicadores({ storeIds: ['123', "45'; DROP--", 'abc', '789'] })
    expect(where).toContain("o.store_id::text IN ('123', '789')")
    expect(where).not.toContain('DROP')
  })

  it('storeIds sin ningún id válido no agrega cláusula', () => {
    const { where } = sqlFiltrosIndicadores({ storeIds: ['abc', ''] })
    expect(where).toBe('')
  })

  it('bloqueo y store se combinan', () => {
    const { join, where } = sqlFiltrosIndicadores({ bloqueo: 'knox', storeIds: ['55'] })
    expect(join).toContain('FROM devices')
    expect(where).toContain("ILIKE 'samsung%'")
    expect(where).toContain("o.store_id::text IN ('55')")
  })

  it('expone la whitelist de bloqueos', () => {
    expect(BLOQUEOS).toEqual(['knox', 'motosafe', 'dlc'])
  })
})
