import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

const navItems = [
  { href: '/mi-dashboard', label: 'Dashboard' },
  { href: '/stock', label: 'Mi stock' },
  { href: '/auto-auditoria', label: 'Auto-auditoría' },
  { href: '/mis-liquidaciones', label: 'Liquidaciones' },
]

export default async function ConsignatarioLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user || user.user_metadata?.rol !== 'consignatario') redirect('/login')

  return (
    <div className="flex min-h-screen bg-gray-50">
      <aside className="w-60 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-5 border-b border-gray-200">
          <img src="/logo.png" alt="GOcelular" className="h-8" />
          <span className="text-xs text-gray-400 block mt-1">Panel Consignatario</span>
        </div>
        <nav className="flex-1 p-3 space-y-0.5">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href}
              className="block px-3 py-2 text-sm text-gray-600 rounded-lg hover:bg-magenta-50 hover:text-magenta-700 transition-colors">
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="p-3 border-t border-gray-200">
          <form action="/api/auth/signout" method="post">
            <button type="submit"
              className="w-full text-left px-3 py-2 text-sm text-gray-500 rounded-lg hover:bg-gray-100 transition-colors">
              Cerrar sesión
            </button>
          </form>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  )
}
