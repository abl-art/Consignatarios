import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Tipo de OTP que acepta verifyOtp vía token_hash (subconjunto de
// EmailOtpType de @supabase/auth-js) — se define acá en vez de importarlo
// para no depender de que el paquete lo reexporte desde su entrypoint
// público. Acotado a los dos flujos que esta ruta sirve en este repo:
// invitación (alta por Task 8) y recupero de contraseña. No hay signup,
// magiclink ni email_change en la app — no hace falta aceptarlos acá.
type TipoOtpEmail = 'invite' | 'recovery'

const TIPOS_VALIDOS: readonly string[] = ['invite', 'recovery']

// Destino del link de invitación/recupero de contraseña (invite/recovery de
// Supabase Auth): verifica el token_hash con el client SSR (setea cookies de
// sesión) y manda a establecer contraseña. Ruta en el allowlist del
// middleware para usuarios logueados y no logueados.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const tokenHash = searchParams.get('token_hash')
  const tipoParam = searchParams.get('type')

  if (tokenHash && tipoParam && TIPOS_VALIDOS.includes(tipoParam)) {
    const supabase = createClient()
    const { error } = await supabase.auth.verifyOtp({
      type: tipoParam as TipoOtpEmail,
      token_hash: tokenHash,
    })
    if (!error) {
      return NextResponse.redirect(new URL('/establecer-password', origin))
    }
  }

  return NextResponse.redirect(new URL('/login?error=link-invalido', origin))
}
