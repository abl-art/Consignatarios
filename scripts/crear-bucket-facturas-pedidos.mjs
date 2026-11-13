// Crea el bucket privado 'facturas-pedidos' (Gestor de Pedidos, nov 2026) donde
// se guardan las facturas de proveedor de cada pedido enviado (proceso Adm y Finanzas).
// Uso: node scripts/crear-bucket-facturas-pedidos.mjs
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')
const getEnv = (k) => {
  const l = env.find((x) => x.startsWith(k + '='))
  return l ? l.slice(k.length + 1).trim().replace(/^["']|["'\\n]+$/g, '').replace(/\\n$/, '') : null
}
const supabase = createClient(getEnv('NEXT_PUBLIC_SUPABASE_URL'), getEnv('SUPABASE_SERVICE_ROLE_KEY'))

const { data: buckets, error: eList } = await supabase.storage.listBuckets()
if (eList) throw new Error(eList.message)

const existente = buckets.find((b) => b.name === 'facturas-pedidos')
if (existente) {
  console.log('El bucket "facturas-pedidos" ya existe, no se crea de nuevo.')
  process.exit(0)
}

const { error } = await supabase.storage.createBucket('facturas-pedidos', { public: false })
if (error) throw new Error(error.message)
console.log('Bucket "facturas-pedidos" creado (privado).')
