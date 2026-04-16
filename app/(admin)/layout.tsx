import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

interface NavItem {
  href: string
  label: string
  children?: { href: string; label: string }[]
}

const navItems: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard' },
  {
    href: '/inventario',
    label: 'Inventario',
    children: [
      { href: '/inventario/tenencia', label: 'Tenencia consignatarios' },
    ],
  },
  { href: '/asignar', label: 'Asignar stock' },
  { href: '/consignatarios', label: 'Consignatarios' },
  { href: '/modelos', label: 'Modelos y precios' },
  { href: '/auditorias', label: 'Auditorías' },
  { href: '/diferencias', label: 'Diferencias' },
  { href: '/garantias', label: 'Garantías' },
  { href: '/liquidaciones', label: 'Liquidaciones' },
  { href: '/ventas', label: 'Ventas' },
  { href: '/reportes', label: 'Reportes' },
  { href: '/sync', label: 'Sincronización' },
]

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user || user.user_metadata?.rol !== 'admin') redirect('/login')

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="w-60 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-5 border-b border-gray-200">
          <img src="/logo.png" alt="GOcelular" className="h-8" />
          <span className="text-xs text-gray-400 block">Panel Admin</span>
        </div>
        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {navItems.map((item) => (
            <div key={item.href}>
              <Link
                href={item.href}
                className="block px-3 py-2 text-sm text-gray-600 rounded-lg hover:bg-magenta-50 hover:text-magenta-700 transition-colors"
              >
                {item.label}
              </Link>
              {item.children && (
                <div className="ml-3 mt-0.5 space-y-0.5 border-l border-gray-200 pl-2">
                  {item.children.map((child) => (
                    <Link
                      key={child.href}
                      href={child.href}
                      className="block px-3 py-1.5 text-xs text-gray-500 rounded-lg hover:bg-magenta-50 hover:text-magenta-700 transition-colors"
                    >
                      {child.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          ))}
        </nav>
        <div className="p-3 border-t border-gray-200">
          <form action="/api/auth/signout" method="post">
            <button
              type="submit"
              className="w-full text-left px-3 py-2 text-sm text-gray-500 rounded-lg hover:bg-gray-100 transition-colors"
            >
              Cerrar sesión
            </button>
          </form>
        </div>
      </aside>

      {/* Contenido */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  )
}
