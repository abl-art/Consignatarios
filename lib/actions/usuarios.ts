'use server'

// Panel /usuarios (Task 8): alta por invitación, reinvitar, activar/desactivar
// y listado. TODAS las actions arrancan con requireSuperAdmin() — solo
// super admins pueden leer o escribir usuarios_permisos, y SIEMPRE con el
// client de service role (createAdminClient), nunca con el client SSR.

import { revalidatePath } from 'next/cache'
import { requireSuperAdmin } from '@/lib/permisos-server'
import { createAdminClient } from '@/lib/supabase/admin'
import { emailPermitido, resumenAccesos } from '@/lib/permisos'
import type { Permisos } from '@/lib/permisos-catalogo'

const REDIRECT_ESTABLECER_PASSWORD = 'https://goabl.app/establecer-password'
const YA_TIENE_USUARIO = 'Ese mail ya tiene usuario'

export type FilaUsuario = {
  userId: string
  email: string
  superAdmin: boolean
  activo: boolean
  invitacionPendiente: boolean
  resumen: string
}

/**
 * Lista SOLO los usuarios del sistema de permisos (filas de
 * usuarios_permisos = restringidos + super admins). Admins plenos sin fila
 * y consignatarios no aparecen acá — decisión del diseño: este panel
 * gestiona restringidos y super admins, no todo auth.users.
 */
export async function listarUsuarios(): Promise<FilaUsuario[]> {
  await requireSuperAdmin()
  const admin = createAdminClient()

  const { data: filas, error } = await admin
    .from('usuarios_permisos')
    .select('user_id, email, super_admin, activo, permisos')
    .order('email', { ascending: true })

  if (error) throw new Error(error.message)

  return Promise.all(
    (filas ?? []).map(async (fila) => {
      const { data: userData } = await admin.auth.admin.getUserById(fila.user_id)
      const permisos = (fila.permisos as Permisos) ?? {}

      return {
        userId: fila.user_id,
        email: fila.email,
        superAdmin: fila.super_admin ?? false,
        activo: fila.activo ?? true,
        invitacionPendiente: userData?.user ? !userData.user.email_confirmed_at : false,
        resumen: resumenAccesos(permisos),
      }
    })
  )
}

/**
 * Alta de un usuario restringido por invitación. Valida dominio, chequea
 * que no exista ya (en usuarios_permisos o en Supabase Auth) e invita vía
 * inviteUserByEmail — que es también el camino de `reinvitar` para
 * invitaciones pendientes (ver comentario ahí).
 */
export async function crearUsuario(email: string): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireSuperAdmin()

  const normalizado = email.trim().toLowerCase()
  if (!emailPermitido(normalizado)) {
    return { ok: false, error: 'Solo mails @gocuotas.com' }
  }

  const admin = createAdminClient()

  // Pre-chequeo barato: ¿ya hay una fila nuestra con ese mail? (evita el
  // caso "ya lo invité desde este panel, lo tecleé de nuevo").
  const { data: existente } = await admin
    .from('usuarios_permisos')
    .select('user_id')
    .ilike('email', normalizado)
    .maybeSingle()
  if (existente) {
    return { ok: false, error: YA_TIENE_USUARIO }
  }

  const { data, error } = await admin.auth.admin.inviteUserByEmail(normalizado, {
    redirectTo: REDIRECT_ESTABLECER_PASSWORD,
  })

  if (error || !data?.user) {
    // GoTrue devuelve error de "ya registrado" cuando el mail corresponde a
    // un usuario de Auth YA CONFIRMADO (p.ej. un admin pleno existente desde
    // antes de este sistema, todavía no migrado a usuarios_permisos).
    if (error && /already/i.test(error.message)) {
      return { ok: false, error: YA_TIENE_USUARIO }
    }
    return { ok: false, error: error?.message ?? 'No se pudo invitar al usuario' }
  }

  const userId = data.user.id

  const { error: metaError } = await admin.auth.admin.updateUserById(userId, {
    app_metadata: { rol: 'restringido' },
  })
  if (metaError) return { ok: false, error: metaError.message }

  const { error: insertError } = await admin
    .from('usuarios_permisos')
    .insert({ user_id: userId, email: normalizado, permisos: {} })
  if (insertError) return { ok: false, error: insertError.message }

  revalidatePath('/usuarios')
  return { ok: true }
}

/**
 * Re-dispara la invitación de un usuario con invitación pendiente.
 *
 * Investigado: inviteUserByEmail en Supabase Auth (GoTrue) crea el usuario Y
 * manda el mail la primera vez; si se lo llama de nuevo para un mail que YA
 * existe pero sigue SIN CONFIRMAR (nuestro caso: invitación pendiente),
 * GoTrue regenera el link y reenvía el mail en vez de rechazarlo — el
 * rechazo ("already registered") es específico de mails YA CONFIRMADOS, que
 * es justo lo que usa crearUsuario para detectar "ya existe". Por eso
 * reinvitar reutiliza el mismo inviteUserByEmail en vez de generateLink
 * (que solo genera el link, sin mandar el mail — no sirve para "reenviar").
 */
export async function reinvitar(userId: string): Promise<void> {
  await requireSuperAdmin()
  const admin = createAdminClient()

  const { data: userData, error: userError } = await admin.auth.admin.getUserById(userId)
  if (userError || !userData?.user?.email) {
    throw new Error(userError?.message ?? 'Usuario no encontrado')
  }
  if (userData.user.email_confirmed_at) {
    throw new Error('Ese usuario ya confirmó su cuenta, no tiene invitación pendiente')
  }

  const { error } = await admin.auth.admin.inviteUserByEmail(userData.user.email, {
    redirectTo: REDIRECT_ESTABLECER_PASSWORD,
  })
  if (error) throw new Error(error.message)

  revalidatePath('/usuarios')
}

/**
 * Activa/desactiva un usuario restringido: ban_duration en Supabase Auth
 * (bloquea el login) + columna `activo` en usuarios_permisos (la lee el
 * middleware/getUsuarioActual para el gate de permisos).
 */
export async function setActivo(userId: string, activo: boolean): Promise<void> {
  await requireSuperAdmin()
  const admin = createAdminClient()

  const { error: authError } = await admin.auth.admin.updateUserById(userId, {
    ban_duration: activo ? 'none' : '876000h',
  })
  if (authError) throw new Error(authError.message)

  const { error } = await admin
    .from('usuarios_permisos')
    .update({ activo })
    .eq('user_id', userId)
  if (error) throw new Error(error.message)

  revalidatePath('/usuarios')
}
