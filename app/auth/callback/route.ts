import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { accesoGoogle } from '@/lib/permisos'

// Destino del login con Google (OAuth PKCE): canjea el code por la sesión y
// aplica la regla de acceso — solo cuentas @gocuotas.com YA invitadas (con
// rol). Un no invitado se rechaza y su usuario auto-creado por el OAuth se
// borra, así la cuenta no queda a medio crear (las invitaciones las manda el
// admin desde /usuarios). Ruta en el allowlist del middleware.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  if (!code) return NextResponse.redirect(new URL('/login?error=google', origin))

  const supabase = createClient()
  const { data, error } = await supabase.auth.exchangeCodeForSession(code)
  if (error || !data.user?.email) {
    return NextResponse.redirect(new URL('/login?error=google', origin))
  }

  const rol = (data.user.app_metadata?.rol as string | undefined) ?? undefined
  const acceso = accesoGoogle(data.user.email, rol)

  if (acceso !== 'ok') {
    // Sin rol = el OAuth recién creó este usuario: borrarlo para que un
    // intento de entrada no deje cuentas fantasma ni pise una invitación futura
    if (!rol) {
      try {
        await createAdminClient().auth.admin.deleteUser(data.user.id)
      } catch (e) {
        console.error('auth/callback: no se pudo borrar el usuario no invitado', e)
      }
    }
    await supabase.auth.signOut()
    return NextResponse.redirect(new URL(`/login?error=${acceso}`, origin))
  }

  const destino = rol === 'admin' || rol === 'restringido' ? '/dashboard' : '/mi-dashboard'
  return NextResponse.redirect(new URL(destino, origin))
}
