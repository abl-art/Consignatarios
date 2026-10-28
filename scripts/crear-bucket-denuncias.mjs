// Crea el bucket privado 'denuncias-robo' (Seguros por Robo, oct 2026) donde
// se guardan los archivos de denuncia policial subidos por el cliente.
// Uso: node scripts/crear-bucket-denuncias.mjs
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

const existente = buckets.find((b) => b.name === 'denuncias-robo')
if (existente) {
  console.log('El bucket "denuncias-robo" ya existe, no se crea de nuevo.')
  process.exit(0)
}

const { error } = await supabase.storage.createBucket('denuncias-robo', { public: false })
if (error) throw new Error(error.message)
console.log('Bucket "denuncias-robo" creado (privado).')
