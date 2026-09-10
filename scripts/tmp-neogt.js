const fs = require('fs')
const { Pool } = require('pg')
const env = {}
for (const line of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_0-9]+)=(.*)$/)
  if (m) env[m[1]] = m[2].replace(/^"|"$/g, '').replace(/\\n$/g, '').replace(/"$/g, '')
}
const pool = new Pool({ connectionString: env.GOCELULAR_DB_URL, max: 2, connectionTimeoutMillis: 15000 })
async function q(label, sql, params) {
  try {
    const r = await pool.query(sql, params)
    console.log('== ' + label)
    console.log(JSON.stringify(r.rows, null, 0).slice(0, 2000))
  } catch (e) { console.log('== ' + label + ' ERR: ' + e.message) }
}
async function main() {
  await q('cols devices', `select column_name from information_schema.columns where table_name='devices' order by ordinal_position`)
}
main().then(() => pool.end()).catch(e => { console.error('ERR', e.message); pool.end() })
