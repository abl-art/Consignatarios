import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import NavIcon, { type IconName } from '@/components/NavIcon'

interface NavItem {
  href: string
  label: string
  icon: IconName
  children?: { href: string; label: string; icon: IconName }[]
}

const navItems: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
  {
    href: '/inventario',
    label: 'Inventario',
    icon: 'inventario',
    children: [
      { href: '/inventario/tenencia', label: 'Tenencia consignatarios', icon: 'tenencia' },
      { href: '/inventario/tenencia-propia', label: 'Tenencia propia', icon: 'tenencia-propia' },
    ],
  },
  { href: '/asignar', label: 'Asignar stock', icon: 'asignar' },
  { href: '/consignatarios', label: 'Consignatarios', icon: 'consignatarios' },
  { href: '/modelos', label: 'Modelos y precios', icon: 'modelos' },
  { href: '/auditorias', label: 'Auditorías', icon: 'auditorias' },
  { href: '/diferencias', label: 'Diferencias', icon: 'diferencias' },
  { href: '/garantias', label: 'Garantías', icon: 'garantias' },
  { href: '/liquidaciones', label: 'Liquidaciones', icon: 'liquidaciones' },
  { href: '/ventas', label: 'Ventas', icon: 'ventas' },
  { href: '/reportes', label: 'Reportes', icon: 'reportes' },
  { href: '/sync', label: 'Sincronización', icon: 'sync' },
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
                className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 rounded-lg hover:bg-magenta-50 hover:text-magenta-700 transition-colors"
              >
                <NavIcon name={item.icon} />
                <span>{item.label}</span>
              </Link>
              {item.children && (
                <div className="ml-3 mt-0.5 space-y-0.5 border-l border-gray-200 pl-2">
                  {item.children.map((child) => (
                    <Link
                      key={child.href}
                      href={child.href}
                      className="flex items-center gap-2 px-3 py-1.5 text-xs text-gray-500 rounded-lg hover:bg-magenta-50 hover:text-magenta-700 transition-colors"
                    >
                      <NavIcon name={child.icon} className="w-3.5 h-3.5 shrink-0" />
                      <span>{child.label}</span>
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
