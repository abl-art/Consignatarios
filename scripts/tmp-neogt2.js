const fs = require('fs')
const { Pool } = require('pg')
const env = {}
for (const line of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_0-9]+)=(.*)$/)
  if (m) env[m[1]] = m[2].replace(/^"|"$/g, '').replace(/\\n$/g, '').replace(/"$/g, '')
}
const pool = new Pool({ connectionString: env.GOCELULAR_DB_URL, max: 2, connectionTimeoutMillis: 15000 })
async function main() {
  const r = await pool.query(`
    select imei, brand, model, trustonic_status, lock_solution, order_id,
           enrollment_date::date as enrolado, last_action_date::date as ultima_accion
    from devices
    where model ilike '%neo%gt%' 
    order by trustonic_status, last_action_date desc nulls last`)
  console.log('total NEO GT:', r.rows.length)
  const porEstado = {}
  for (const d of r.rows) porEstado[d.trustonic_status] = (porEstado[d.trustonic_status]||0)+1
  console.log('por estado:', JSON.stringify(porEstado))
  console.log(JSON.stringify(r.rows.filter(d => (d.trustonic_status||'').toLowerCase()==='active'), null, 1))
}
main().then(() => pool.end()).catch(e => { console.error('ERR', e.message); pool.end() })
