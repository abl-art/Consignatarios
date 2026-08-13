import type { Pool } from 'pg'

const MAX_FILAS = 500
const TIMEOUT_MS = 15000

// Palabras que nunca pueden aparecer en una consulta de Celia (defensa en
// profundidad; ademas la sesion corre con default_transaction_read_only)
const PROHIBIDAS = /\b(insert|update|delete|drop|alter|truncate|grant|revoke|create|copy|vacuum|call|execute|listen|notify|reset|comment|merge|lock)\b/i

export function validarSelect(sql: string): { ok: true } | { ok: false; error: string } {
  const limpio = sql
    .replace(/--.*$/gm, '')          // comentarios de linea
    .replace(/\/\*[\s\S]*?\*\//g, '') // comentarios de bloque
    .trim()
    .replace(/;+\s*$/, '')            // ; final permitido
  if (limpio.length === 0) return { ok: false, error: 'Consulta vacía' }
  if (limpio.includes(';')) return { ok: false, error: 'Solo se permite una única sentencia' }
  if (!/^(select|with)\b/i.test(limpio)) return { ok: false, error: 'Solo se permiten consultas SELECT' }
  const m = limpio.match(PROHIBIDAS)
  if (m) return { ok: false, error: `Operación no permitida: ${m[0].toUpperCase()}. Solo lectura.` }
  return { ok: true }
}

export interface ResultadoConsulta {
  filas: Record<string, unknown>[]
  truncado: boolean
}

export async function ejecutarConsulta(pool: Pool, sql: string): Promise<ResultadoConsulta> {
  const val = validarSelect(sql)
  if (!val.ok) throw new Error(val.error)

  const client = await pool.connect()
  try {
    await client.query(`SET statement_timeout = ${TIMEOUT_MS}`)
    await client.query('SET default_transaction_read_only = on')
    const res = await client.query(sql)
    const filas = res.rows.slice(0, MAX_FILAS)
    return { filas, truncado: res.rows.length > MAX_FILAS }
  } finally {
    try {
      await client.query('RESET statement_timeout')
      await client.query('RESET default_transaction_read_only')
    } catch { /* la conexion puede estar rota tras un timeout */ }
    client.release()
  }
}

export function serializarFilas(filas: Record<string, unknown>[]): string {
  return JSON.stringify(filas, (_k, v) => {
    if (typeof v === 'bigint') return v.toString()
    return v
  })
}
