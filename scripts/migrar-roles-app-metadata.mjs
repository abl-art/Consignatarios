#!/usr/bin/env node
// Migra roles de user_metadata -> app_metadata y siembra usuarios_permisos.
//
// Qué hace:
//   1. Pagina auth.admin.listUsers() y a cada usuario le estampa
//      app_metadata.rol = user_metadata.rol — SOLO si app_metadata.rol
//      todavía no está seteado (idempotente: correrlo de nuevo no cambia
//      nada ya estampado).
//   2. victor.kislo@gocuotas.com es un caso especial: su app_metadata.rol
//      se fuerza a 'restringido' (no 'visor', que es lo que tiene en
//      user_metadata) y se le siembra una fila en usuarios_permisos con
//      permisos acotados (dashboard, alertas-fraudes, terceros — solo ver).
//   3. emiliano.canova@gocuotas.com recibe una fila en usuarios_permisos
//      con super_admin=true.
//   4. Loguea cada cambio por consola y termina con el resumen
//      { usuarios, estampados, saltados }.
//
// Uso:
//   node scripts/migrar-roles-app-metadata.mjs --dry-run   (no escribe nada)
//   node scripts/migrar-roles-app-metadata.mjs             (corrida real — Task 10)

import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const DRY_RUN = process.argv.includes('--dry-run')

// --- Carga de .env.local, saneando el gotcha conocido del repo: algunos
// valores vienen con secuencias `\n` literales dentro de las comillas. ---
const envLines = fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')
function getEnv(key) {
  const line = envLines.find((l) => l.startsWith(key + '='))
  if (!line) return null
  let value = line.slice(key.length + 1).trim()
  if (value.startsWith('"') && value.endsWith('"')) {
    value = value.slice(1, -1)
  }
  value = value.replace(/\\n/g, '').replace(/\n/g, '')
  return value.trim()
}

const SUPABASE_URL = getEnv('NEXT_PUBLIC_SUPABASE_URL')
const SERVICE_ROLE_KEY = getEnv('SUPABASE_SERVICE_ROLE_KEY')
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en .env.local')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// --- Casos especiales ---
const VICTOR_EMAIL = 'victor.kislo@gocuotas.com'
const VICTOR_ROL = 'restringido'
const VICTOR_PERMISOS = {
  dashboard: { root: 'ver' },
  'alertas-fraudes': { root: 'ver' },
  terceros: { root: 'ver' },
}
const EMILIANO_EMAIL = 'emiliano.canova@gocuotas.com'

console.log(DRY_RUN ? '=== DRY RUN (no se escribe nada) ===' : '=== CORRIDA REAL ===')

async function listarTodosLosUsuarios() {
  const usuarios = []
  let page = 1
  const perPage = 200
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage })
    if (error) throw new Error(`listUsers falló: ${error.message}`)
    usuarios.push(...data.users)
    if (data.users.length < perPage) break
    page += 1
  }
  return usuarios
}

async function estamparAppMetadataRol(user, nuevoRol) {
  if (DRY_RUN) {
    console.log(`  [dry-run] estamparía app_metadata.rol='${nuevoRol}' en ${user.email}`)
    return
  }
  const { error } = await supabase.auth.admin.updateUserById(user.id, {
    app_metadata: { ...user.app_metadata, rol: nuevoRol },
  })
  if (error) throw new Error(`updateUserById falló para ${user.email}: ${error.message}`)
  console.log(`  estampado app_metadata.rol='${nuevoRol}' en ${user.email}`)
}

async function upsertUsuarioPermisos(user, campos) {
  const row = { user_id: user.id, email: user.email, ...campos }
  if (DRY_RUN) {
    console.log(`  [dry-run] upsert en usuarios_permisos para ${user.email}:`, JSON.stringify(campos))
    return
  }
  const { error } = await supabase.from('usuarios_permisos').upsert(row, { onConflict: 'user_id' })
  if (error) throw new Error(`upsert usuarios_permisos falló para ${user.email}: ${error.message}`)
  console.log(`  upsert usuarios_permisos OK para ${user.email}:`, JSON.stringify(campos))
}

async function main() {
  const usuarios = await listarTodosLosUsuarios()
  console.log(`Usuarios encontrados: ${usuarios.length}`)

  let estampados = 0
  let saltados = 0

  for (const user of usuarios) {
    const email = (user.email ?? '').toLowerCase()
    const rolActual = user.app_metadata?.rol
    const esVictor = email === VICTOR_EMAIL

    console.log(`- ${user.email} (user_metadata.rol=${user.user_metadata?.rol ?? '—'}, app_metadata.rol=${rolActual ?? '—'})`)

    if (esVictor) {
      // Caso especial: fuerza 'restringido', no el 'visor' de user_metadata.
      if (rolActual === VICTOR_ROL) {
        console.log(`  saltado: ${user.email} ya tiene app_metadata.rol='${VICTOR_ROL}'`)
        saltados += 1
      } else {
        await estamparAppMetadataRol(user, VICTOR_ROL)
        estampados += 1
      }
      continue
    }

    // Regla genérica: solo estampa si app_metadata.rol todavía no está seteado.
    if (rolActual) {
      console.log(`  saltado: ${user.email} ya tiene app_metadata.rol seteado`)
      saltados += 1
      continue
    }

    const rolDeUserMetadata = user.user_metadata?.rol
    if (!rolDeUserMetadata) {
      console.log(`  saltado: ${user.email} no tiene rol en user_metadata`)
      saltados += 1
      continue
    }

    await estamparAppMetadataRol(user, rolDeUserMetadata)
    estampados += 1
  }

  // --- Siembra de usuarios_permisos para los casos conocidos ---
  const victor = usuarios.find((u) => (u.email ?? '').toLowerCase() === VICTOR_EMAIL)
  if (victor) {
    console.log(`Sembrando usuarios_permisos para ${VICTOR_EMAIL}...`)
    await upsertUsuarioPermisos(victor, { permisos: VICTOR_PERMISOS })
  } else {
    console.log(`AVISO: no se encontró el usuario ${VICTOR_EMAIL} — no se siembra su fila en usuarios_permisos`)
  }

  const emiliano = usuarios.find((u) => (u.email ?? '').toLowerCase() === EMILIANO_EMAIL)
  if (emiliano) {
    console.log(`Sembrando usuarios_permisos para ${EMILIANO_EMAIL}...`)
    await upsertUsuarioPermisos(emiliano, { super_admin: true })
  } else {
    console.log(`AVISO: no se encontró el usuario ${EMILIANO_EMAIL} — no se siembra su fila en usuarios_permisos`)
  }

  const resumen = { usuarios: usuarios.length, estampados, saltados }
  console.log('Resumen:', JSON.stringify(resumen))
}

main().catch((err) => {
  console.error('Error en la migración:', err.message)
  process.exit(1)
})
