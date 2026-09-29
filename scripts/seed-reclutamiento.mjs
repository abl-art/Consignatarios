// Siembra una búsqueda de reclutamiento desde un JSON generado externamente.
// Uso: node scripts/seed-reclutamiento.mjs <seed.json> [<carpeta con CVs pdf>]
// El JSON no vive en el repo (datos personales de candidatos).
import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const env = fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')
const getEnv = (k) => {
  const l = env.find((x) => x.startsWith(k + '='))
  return l ? l.slice(k.length + 1).trim().replace(/^["']|["'\\n]+$/g, '').replace(/\\n$/, '') : null
}
const supabase = createClient(getEnv('NEXT_PUBLIC_SUPABASE_URL'), getEnv('SUPABASE_SERVICE_ROLE_KEY'))

const seedPath = process.argv[2]
const cvDir = process.argv[3]
if (!seedPath) { console.error('Falta el path del seed.json'); process.exit(1) }
const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'))

const CRITERIOS = [
  { clave: 'ejecucion', nombre: 'Ejecución', prioritario: true },
  { clave: 'vision_negocios', nombre: 'Visión de negocios', prioritario: true },
  { clave: 'procesos', nombre: 'Procesos', prioritario: true },
  { clave: 'resolucion_problemas', nombre: 'Resolución de problemas', prioritario: true },
  { clave: 'nativo_digital', nombre: 'Nativo digital', prioritario: true },
  { clave: 'data_driven', nombre: 'Data driven', prioritario: false },
  { clave: 'negociacion', nombre: 'Negociación / comercial', prioritario: false },
  { clave: 'liderazgo', nombre: 'Liderazgo', prioritario: false },
]

const MANDATO =
  'Duplicar la operación de GOcelular + GO Market: de 10.000 a 20.000 ventas mensuales, ' +
  'tanto en venta propia (tienda online) como en venta de terceros (red de comercios), ' +
  'con EBITDA mayor al 20%. Dueño/a del P&L y de la cadena de valor completa.'

const { data: existente } = await supabase
  .from('rec_busquedas')
  .select('id')
  .eq('nombre', 'Business Owner — GOcelular + GO Market')
  .maybeSingle()
if (existente) {
  console.log('La búsqueda ya existe (' + existente.id + ') — borrala antes de re-sembrar')
  process.exit(1)
}

const { data: busqueda, error: eB } = await supabase
  .from('rec_busquedas')
  .insert({ nombre: 'Business Owner — GOcelular + GO Market', mandato: MANDATO, criterios: CRITERIOS })
  .select('id')
  .single()
if (eB) throw new Error(eB.message)
console.log('Búsqueda creada:', busqueda.id)

for (const c of seed.candidatos) {
  let cvPath = null
  if (cvDir && c.cv_pdf) {
    const local = path.join(cvDir, c.cv_pdf)
    if (fs.existsSync(local)) {
      cvPath = `${busqueda.id}/${c.slug}.pdf`
      const { error: eUp } = await supabase.storage
        .from('cvs')
        .upload(cvPath, fs.readFileSync(local), { contentType: 'application/pdf', upsert: true })
      if (eUp) { console.warn('  CV falló', c.slug, eUp.message); cvPath = null }
    }
  }
  const { data: cand, error: eC } = await supabase
    .from('rec_candidatos')
    .insert({
      busqueda_id: busqueda.id,
      nombre: c.nombre,
      arquetipo: c.arquetipo,
      etiquetas: c.etiquetas,
      resumen: c.resumen,
      cv_path: cvPath,
      scores: c.scores,
      favor: c.favor,
      riesgos: c.riesgos,
      preguntas: c.preguntas,
    })
    .select('id')
    .single()
  if (eC) throw new Error(eC.message)
  if (c.entrevista) {
    const { error: eE } = await supabase.from('rec_entrevistas').insert({
      candidato_id: cand.id,
      titulo: c.entrevista.titulo,
      duracion_min: c.entrevista.duracion_min,
      transcript: c.entrevista.transcript,
      analisis: c.entrevista.analisis,
      estado: 'listo',
    })
    if (eE) throw new Error(eE.message)
  }
  console.log('  ✓', c.nombre, cvPath ? '(CV subido)' : '(sin CV)', c.entrevista ? '+ entrevista' : '')
}
console.log('Seed completo. Generá la recomendación desde la UI con el botón "Generar".')
