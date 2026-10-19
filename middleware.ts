import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { rutaPermitida, primeraRutaPermitida } from '@/lib/permisos'
import type { Permisos } from '@/lib/permisos-catalogo'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  // Rutas públicas
  if (pathname.startsWith('/proveedor/') || pathname.startsWith('/share/') || pathname.startsWith('/afiliados/') || pathname.startsWith('/partner/') || pathname === '/catalogo') {
    return supabaseResponse
  }

  if (pathname === '/login') {
    if (user) {
      const rol = user.app_metadata?.rol
      return NextResponse.redirect(new URL(rol === 'admin' || rol === 'restringido' ? '/dashboard' : '/mi-dashboard', request.url))
    }
    return supabaseResponse
  }

  // Sin sesión → login
  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Allowlist: páginas que cualquier usuario logueado puede ver, sin pasar
  // por el chequeo de permisos (evita loops de redirect y rutas de auth).
  if (
    pathname === '/sin-acceso' ||
    pathname === '/establecer-password' ||
    pathname === '/auth/confirm' || pathname.startsWith('/auth/confirm/')
  ) {
    return supabaseResponse
  }

  const rol = user.app_metadata?.rol

  // Restringido: default deny TOTAL — rutaPermitida se chequea contra
  // CUALQUIER pathname que haya pasado los allowlists de arriba (no solo
  // la lista legacy de prefijos admin), leyendo su propia fila de
  // usuarios_permisos (RLS permite leer la fila propia con el client SSR).
  if (rol === 'restringido') {
    let permisos: Permisos = {}
    try {
      const { data, error } = await supabase
        .from('usuarios_permisos')
        .select('permisos, activo')
        .eq('user_id', user.id)
        .maybeSingle()
      if (error) {
        console.error('[permisos] error leyendo usuarios_permisos en middleware:', error.message)
        // fail-closed: permisos queda en {}
      } else if (data && data.activo !== false) {
        permisos = (data.permisos as Permisos) ?? {}
      }
      // sin fila (data null) o activo === false ⇒ permisos queda en {}
    } catch (e) {
      console.error('[permisos] excepción leyendo usuarios_permisos en middleware:', e)
      // fail-closed: permisos queda en {}
    }

    if (!rutaPermitida(permisos, pathname)) {
      // Nunca pass-through de una ruta denegada. Si la "primera permitida"
      // calculada coincide con el pathname actual (o no hay ninguna),
      // redirigir a /sin-acceso en vez de dejar pasar — evita depender del
      // invariante no-verificado "ninguna ruta duplicada en CATALOGO".
      const candidato = primeraRutaPermitida(permisos)
      const destino = candidato && candidato !== pathname ? candidato : '/sin-acceso'
      return NextResponse.redirect(new URL(destino, request.url))
    }
    return supabaseResponse
  }

  // Rutas admin: solo admins (gate legacy por prefijos, igual que antes de
  // sumar `restringido` — ese rol ya fue resuelto arriba y nunca llega aquí).
  if (pathname.startsWith('/dashboard') || pathname.startsWith('/inventario') ||
      pathname.startsWith('/modelos') || pathname.startsWith('/consignatarios') ||
      pathname.startsWith('/asignar') || pathname.startsWith('/auditorias') ||
      pathname.startsWith('/diferencias') || pathname.startsWith('/sync') ||
      pathname.startsWith('/ventas') || pathname.startsWith('/reportes') ||
      pathname.startsWith('/liquidaciones') || pathname.startsWith('/garantias') ||
      pathname.startsWith('/finanzas') ||
      pathname.startsWith('/compras') ||
      pathname.startsWith('/celia')) {
    if (rol !== 'admin') {
      return NextResponse.redirect(new URL('/mi-dashboard', request.url))
    }
  }

  // Rutas consignatario: solo consignatarios
  if (pathname.startsWith('/mi-dashboard') || pathname.startsWith('/stock') ||
      pathname.startsWith('/mis-ventas') || pathname.startsWith('/auto-auditoria') ||
      pathname.startsWith('/mis-liquidaciones')) {
    if (rol !== 'consignatario') {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api|.*\\.(?:png|jpg|jpeg|svg|gif|ico)$).*)'],
}
