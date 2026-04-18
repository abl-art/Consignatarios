import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import NavIcon, { type IconName } from '@/components/NavIcon'
import NavGroup from '@/components/NavGroup'

interface NavItem {
  href: string
  label: string
  icon: IconName
  external?: boolean
  children?: { href: string; label: string; icon: IconName }[]
}

const navItems: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard360', icon: 'dashboard' },
  { href: 'https://gocelular.gocuotas.com/tienda', label: 'Tienda Online', icon: 'tienda', external: true },
  { href: 'https://gocelular.vercel.app/dashboard', label: 'Centro de Operaciones', icon: 'sync', external: true },
  { href: '/compras', label: 'Compras', icon: 'tienda' },
  {
    href: '/inventario',
    label: 'Inventario',
    icon: 'inventario',
    children: [
      { href: '/inventario/celulares', label: 'Celulares', icon: 'modelos' },
      { href: '/inventario/smartwatches', label: 'Smartwatches', icon: 'inventario' },
      { href: '/inventario/parlantes', label: 'Parlantes', icon: 'inventario' },
      { href: '/inventario/auriculares', label: 'Auriculares', icon: 'inventario' },
      { href: '/inventario/kits-seguridad', label: 'Kits de Seguridad', icon: 'inventario' },
    ],
  },
  {
    href: '/consignatarios',
    label: 'Consignatarios',
    icon: 'consignatarios',
    children: [
      { href: '/consignatarios/dashboard', label: 'Dashboard', icon: 'dashboard' },
      { href: '/garantias', label: 'Garantías', icon: 'garantias' },
      { href: '/auditorias', label: 'Auditorías', icon: 'auditorias' },
      { href: '/diferencias', label: 'Diferencias', icon: 'diferencias' },
      { href: '/ventas', label: 'Ventas', icon: 'ventas' },
      { href: '/liquidaciones', label: 'Liquidaciones', icon: 'liquidaciones' },
    ],
  },
  { href: '/modelos', label: 'Modelos y precios', icon: 'modelos' },
  { href: '/reportes', label: 'Reportes', icon: 'reportes' },
  { href: '/finanzas', label: 'Finanzas', icon: 'finanzas' },
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
          {navItems.map((item) =>
            item.children ? (
              <NavGroup
                key={item.href}
                href={item.href}
                label={item.label}
                icon={item.icon}
                children={item.children}
              />
            ) : item.external ? (
              <a
                key={item.href}
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 rounded-lg hover:bg-magenta-50 hover:text-magenta-700 transition-colors"
              >
                <NavIcon name={item.icon} />
                <span>{item.label}</span>
                <svg className="w-3 h-3 ml-auto text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
              </a>
            ) : (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 rounded-lg hover:bg-magenta-50 hover:text-magenta-700 transition-colors"
              >
                <NavIcon name={item.icon} />
                <span>{item.label}</span>
              </Link>
            )
          )}
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
