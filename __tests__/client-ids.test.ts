import { describe, it, expect } from 'vitest'
import { sqlCondicionClientes, condicionClientesNum, CLIENTES_TERCEROS, CLIENTES_TODOS, CLIENT_IDS_PROPIOS } from '@/lib/client-ids'

describe('sqlCondicionClientes', () => {
  it('lista de ids arma IN con whitelist', () => {
    expect(sqlCondicionClientes(['2026134', '2461631'], 'o.client_id::text'))
      .toBe("o.client_id::text IN ('2026134', '2461631')")
  })

  it('lista con ids inválidos los filtra; toda inválida devuelve null', () => {
    expect(sqlCondicionClientes(['123', "x'; DROP--"], 'o.client_id::text'))
      .toBe("o.client_id::text IN ('123')")
    expect(sqlCondicionClientes(["x'; DROP--"], 'o.client_id::text')).toBeNull()
  })

  it('terceros = NOT IN propios (regla: todo lo que no es propio es merchant)', () => {
    expect(sqlCondicionClientes(CLIENTES_TERCEROS, 'o.client_id::text'))
      .toBe("o.client_id::text NOT IN ('2026134', '2461631')")
  })

  it('todos = sin filtro (TRUE)', () => {
    expect(sqlCondicionClientes(CLIENTES_TODOS, 'o.client_id::text')).toBe('TRUE')
  })
})

describe('condicionClientesNum (queries parametrizadas a GOcuotas directa)', () => {
  it('lista → IN con placeholders y values numéricos', () => {
    expect(condicionClientesNum(['2026134', '2461631'], 'o.client_id')).toEqual({
      clause: 'AND o.client_id IN ($1,$2)',
      values: [2026134, 2461631],
    })
  })

  it('notIn → NOT IN con placeholders', () => {
    expect(condicionClientesNum(CLIENTES_TERCEROS, 'o.client_id')).toEqual({
      clause: 'AND o.client_id NOT IN ($1,$2)',
      values: CLIENT_IDS_PROPIOS.map(Number),
    })
  })

  it('todos → sin cláusula ni values', () => {
    expect(condicionClientesNum(CLIENTES_TODOS, 'o.client_id')).toEqual({ clause: '', values: [] })
  })

  it('respeta el índice inicial de placeholders', () => {
    expect(condicionClientesNum(['5495277'], 'o.client_id', 3)).toEqual({
      clause: 'AND o.client_id IN ($3)',
      values: [5495277],
    })
  })

  it('lista sin ids válidos devuelve null', () => {
    expect(condicionClientesNum(['abc'], 'o.client_id')).toBeNull()
  })
})
