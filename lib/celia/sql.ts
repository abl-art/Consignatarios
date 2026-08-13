import type { Pool } from 'pg'

const MAX_FILAS = 500
const TIMEOUT_MS = 15000

// Palabras que nunca pueden aparecer en una consulta de Celia (defensa en
// profundidad; ademas la sesion corre con default_transaction_read_only)
const PROHIBIDAS = /\b(insert|update|delete|drop|alter|truncate|grant|revoke|create|copy|vacuum|call|execute|listen|notify|reset|comment|merge|lock|set_config|current_setting|pg_sleep|pg_read_file|pg_read_binary_file|lo_import|lo_export|dblink|dblink_exec|pg_terminate_backend|pg_cancel_backend)\b/i

function limpiarSql(sql: string): string {
  return sql
    .replace(/--.*$/gm, '')          // comentarios de linea
    .replace(/\/\*[\s\S]*?\*\//g, '') // comentarios de bloque
    .trim()
    .replace(/;+\s*$/, '')            // ; final permitido
}

export function envolverConLimite(sql: string): string {
  const limpio = limpiarSql(sql)
  return `SELECT * FROM (\n${limpio}\n) AS _celia_q LIMIT 501`
}

export function validarSelect(sql: string): { ok: true } | { ok: false; error: string } {
  const limpio = limpiarSql(sql)
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
    // Todo en UNA transacción: con transaction pooling (pgbouncer) cada
    // statement puede ir a una conexión física distinta, y un SET suelto
    // no se garantiza que aplique al query siguiente. SET LOCAL dentro de
    // BEGIN/COMMIT sí queda atado al mismo turno lógico.
    await client.query('BEGIN READ ONLY')
    try {
      await client.query(`SET LOCAL statement_timeout = ${TIMEOUT_MS}`)
      const sqlConLimite = envolverConLimite(sql)
      const res = await client.query(sqlConLimite)
      await client.query('COMMIT')
      const filas = res.rows.slice(0, MAX_FILAS)
      return { filas, truncado: res.rows.length > MAX_FILAS }
    } catch (e) {
      try { await client.query('ROLLBACK') } catch { /* la conexion puede estar rota tras un timeout */ }
      throw e
    }
  } finally {
    client.release()
  }
}

const MAX_CHARS_RESULTADO = 150_000
const MARCADOR_CORTE = '\n[RESULTADO CORTADO POR TAMAÑO — pedí menos columnas o agregá filtros]'

export function serializarFilas(filas: Record<string, unknown>[]): string {
  const json = JSON.stringify(filas, (_k, v) => {
    if (typeof v === 'bigint') return v.toString()
    return v
  })
  if (json.length > MAX_CHARS_RESULTADO) {
    return json.slice(0, MAX_CHARS_RESULTADO) + MARCADOR_CORTE
  }
  return json
}
