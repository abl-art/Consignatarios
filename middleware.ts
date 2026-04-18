import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

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
  if (pathname === '/login') {
    if (user) {
      const rol = user.user_metadata?.rol
      return NextResponse.redirect(new URL(rol === 'admin' ? '/dashboard' : '/mi-dashboard', request.url))
    }
    return supabaseResponse
  }

  // Sin sesión → login
  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  const rol = user.user_metadata?.rol

  // Rutas admin: solo admins
  if (pathname.startsWith('/dashboard') || pathname.startsWith('/inventario') ||
      pathname.startsWith('/modelos') || pathname.startsWith('/consignatarios') ||
      pathname.startsWith('/asignar') || pathname.startsWith('/auditorias') ||
      pathname.startsWith('/diferencias') || pathname.startsWith('/sync') ||
      pathname.startsWith('/ventas') || pathname.startsWith('/reportes') ||
      pathname.startsWith('/liquidaciones') || pathname.startsWith('/garantias') ||
      pathname.startsWith('/finanzas') ||
      pathname.startsWith('/compras')) {
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
