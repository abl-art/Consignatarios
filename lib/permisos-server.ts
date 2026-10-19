// Helpers server-side de autorización: NO llevan 'use server' porque son
// funciones importadas por server actions (no son actions en sí mismas).
// El rol se lee siempre de user.app_metadata?.rol — NUNCA de user_metadata
// (ese campo lo puede editar el propio usuario desde el cliente).

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { puedeOperar, puedeVer } from '@/lib/permisos'
import type { NivelPermiso, Permisos } from '@/lib/permisos-catalogo'

export type UsuarioActual = {
  userId: string
  email: string
  rol: string
  superAdmin: boolean
  activo: boolean
  permisos: Permisos
}

export async function getUsuarioActual(): Promise<UsuarioActual | null> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const rol = user.app_metadata?.rol ?? ''
  const userId = user.id
  const email = user.email ?? ''

  if (rol === 'admin') {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('usuarios_permisos')
      .select('super_admin')
      .eq('user_id', userId)
      .maybeSingle()

    if (error) console.error('[permisos] error leyendo usuarios_permisos', error)

    return {
      userId,
      email,
      rol,
      superAdmin: data?.super_admin ?? false,
      activo: true,
      permisos: {},
    }
  }

  if (rol === 'restringido') {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('usuarios_permisos')
      .select('super_admin, activo, permisos')
      .eq('user_id', userId)
      .maybeSingle()

    if (error) console.error('[permisos] error leyendo usuarios_permisos', error)

    if (!data) {
      return { userId, email, rol, superAdmin: false, activo: true, permisos: {} }
    }

    return {
      userId,
      email,
      rol,
      superAdmin: data.super_admin ?? false,
      activo: data.activo ?? true,
      permisos: (data.permisos as Permisos) ?? {},
    }
  }

  // Otros roles (consignatario, sin rol, etc.): los llamadores deciden qué
  // hacer con esto — este helper no gatea nada por sí mismo.
  return { userId, email, rol, superAdmin: false, activo: true, permisos: {} }
}

export async function requierePermiso(seccion: string, subitem: string, nivel: NivelPermiso): Promise<void> {
  const usuario = await getUsuarioActual()
  if (!usuario) throw new Error('Sin permiso para esta acción')

  if (usuario.rol === 'admin') return

  if (usuario.rol === 'restringido') {
    if (!usuario.activo) throw new Error('Sin permiso para esta acción')
    const tienePermiso = nivel === 'operar'
      ? puedeOperar(usuario.permisos, seccion, subitem)
      : puedeVer(usuario.permisos, seccion, subitem)
    if (!tienePermiso) throw new Error('Sin permiso para esta acción')
    return
  }

  throw new Error('Sin permiso para esta acción')
}

export async function requireSuperAdmin(): Promise<UsuarioActual> {
  const usuario = await getUsuarioActual()
  if (!usuario || usuario.rol !== 'admin' || !usuario.superAdmin) {
    throw new Error('Solo super admin')
  }
  return usuario
}
