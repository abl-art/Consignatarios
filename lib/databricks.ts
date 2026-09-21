// Cliente mínimo para el SQL Warehouse de Databricks (GOcuotas)
// Usa la API de SQL Statements: POST /api/2.0/sql/statements/
// Credenciales via env: DATABRICKS_HOST, DATABRICKS_TOKEN, DATABRICKS_WAREHOUSE_ID

interface DatabricksColumn {
  name: string
}

interface DatabricksResponse {
  statement_id?: string
  status?: { state?: string; error?: { message?: string } }
  manifest?: { schema?: { columns?: DatabricksColumn[] } }
  result?: { data_array?: (string | null)[][] }
  error_code?: string
  message?: string
}

const MAX_POLL_ATTEMPTS = 30

export async function databricksQuery(sql: string): Promise<Record<string, string | null>[]> {
  const host = process.env.DATABRICKS_HOST
  const token = process.env.DATABRICKS_TOKEN
  const warehouseId = process.env.DATABRICKS_WAREHOUSE_ID
  if (!host || !token || !warehouseId) {
    throw new Error('Faltan credenciales de Databricks (DATABRICKS_HOST / DATABRICKS_TOKEN / DATABRICKS_WAREHOUSE_ID)')
  }

  const res = await fetch(`https://${host}/api/2.0/sql/statements/`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ warehouse_id: warehouseId, statement: sql, wait_timeout: '50s' }),
    cache: 'no-store',
  })
  let data: DatabricksResponse = await res.json()

  // La query puede seguir corriendo si excede el wait_timeout (ej. warehouse frío)
  let attempts = 0
  while ((data.status?.state === 'PENDING' || data.status?.state === 'RUNNING') && attempts < MAX_POLL_ATTEMPTS) {
    await new Promise(r => setTimeout(r, 2000))
    const poll = await fetch(`https://${host}/api/2.0/sql/statements/${data.statement_id}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })
    data = await poll.json()
    attempts++
  }

  if (data.status?.state !== 'SUCCEEDED') {
    throw new Error(data.status?.error?.message || data.message || `Databricks devolvió estado ${data.status?.state || data.error_code || 'desconocido'}`)
  }

  const cols = (data.manifest?.schema?.columns || []).map(c => c.name)
  const rows = data.result?.data_array || []
  // La API devuelve todos los valores como string; los null pueden venir como null o como el literal "null"
  return rows.map(r => Object.fromEntries(cols.map((c, i) => [c, r[i] == null || r[i] === 'null' ? null : r[i]])))
}

export function dbNum(v: string | null | undefined): number {
  if (v == null) return 0
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}
