import { Pool } from 'pg'

// Singleton pool para GOcelular DB — reutilizado por todas las funciones
// max: 5 conexiones simultáneas, idleTimeoutMillis: 30s
let pool: Pool | null = null

export function getPool(): Pool | null {
  const url = process.env.GOCELULAR_DB_URL
  if (!url) return null

  if (!pool) {
    pool = new Pool({
      connectionString: url,
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    })
    // Log errors para no crashear el proceso
    pool.on('error', (err) => {
      console.error('GOcelular pool error:', err.message)
    })
  }
  return pool
}

// Singleton pool para GOcuotas DB directa (orders)
let gocuotasPool: Pool | null = null

export function getGocuotasPool(): Pool | null {
  const host = process.env.PG_GOCUOTAS_HOST
  const user = process.env.PG_GOCUOTAS_USER
  const pass = process.env.PG_GOCUOTAS_PASS
  const db = process.env.PG_GOCUOTAS_DB
  if (!host || !user || !pass || !db) return null

  if (!gocuotasPool) {
    gocuotasPool = new Pool({
      host, port: 5432, user, password: pass, database: db,
      ssl: { rejectUnauthorized: false },
      max: 3,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    })
    gocuotasPool.on('error', (err) => {
      console.error('GOcuotas pool error:', err.message)
    })
  }
  return gocuotasPool
}

// Singleton pool para KEYcontact CRM DB
let keyContactPool: Pool | null = null

export function getKeyContactPool(): Pool | null {
  const url = process.env.KEYCONTACT_DB_URL
  if (!url) return null

  if (!keyContactPool) {
    keyContactPool = new Pool({
      connectionString: url,
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    })
    keyContactPool.on('error', (err) => {
      console.error('KEYcontact pool error:', err.message)
    })
  }
  return keyContactPool
}

// Singleton pool para el Postgres de Supabase (consultas SQL de Celia)
let supabasePool: Pool | null = null

export function getSupabasePool(): Pool | null {
  const url = process.env.SUPABASE_DB_URL
  if (!url) return null

  if (!supabasePool) {
    supabasePool = new Pool({
      connectionString: url,
      max: 3,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
      ssl: { rejectUnauthorized: false },
    })
    supabasePool.on('error', (err) => {
      console.error('Supabase pool error:', err.message)
    })
  }
  return supabasePool
}
