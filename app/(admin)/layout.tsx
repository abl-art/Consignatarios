import { redirect } from 'next/navigation'
import AdminSidebar, { type AdminNavItem } from '@/components/AdminSidebar'
import MobileMenu from '@/components/MobileMenu'
import { contarNovedadesNoLeidas } from '@/lib/actions/novedades'
import { getUsuarioActual } from '@/lib/permisos-server'
import { filtrarNavItems } from '@/lib/permisos'

const navItems: AdminNavItem[] = [
  { href: '/novedades', label: 'Novedades', icon: 'novedades', badge: true },
  { href: '/dashboard', label: 'Dashboard360', icon: 'dashboard' },
  { href: '/celia', label: 'Celia', icon: 'celia' },
  { href: 'https://gocelular.vercel.app/dashboard', label: 'Centro de Operaciones', icon: 'sync', external: true },
  { href: 'https://admin.gocuotas.com/admin/users', label: 'Administrador GOcuotas', icon: 'consignatarios', external: true },
  { href: 'https://carga-simple.vercel.app/inicio', label: 'Carga Simple', icon: 'carga-simple', external: true },
  { href: '/canales', label: 'Canales de Comercialización', icon: 'tienda' },
  { href: '/alertas-fraudes', label: 'Alertas y Fraudes', icon: 'diferencias' },
  { href: '/compras', label: 'Compras', icon: 'fabrica' },
  { href: '/inventario', label: 'Inventario', icon: 'inventario' },
  // /modelos page kept for admin access but hidden from nav - managed via Compras now
  { href: '/finanzas', label: 'Finanzas', icon: 'finanzas' },
  // /sync kept for direct access but hidden from nav (20/10/2026, no se usa)
  { href: '/documentacion', label: 'Documentación', icon: 'documento' },
  { href: '/notas', label: 'Notas y Pendientes', icon: 'reloj' },
  { href: '/reclutamiento', label: 'Reclutamiento', icon: 'consignatarios' },
  { href: '/knox-guard', label: 'Knox Guard', icon: 'diferencias' },
  { href: '/grupo-go', label: 'Grupo GO', icon: 'dashboard' },
]

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const usuario = await getUsuarioActual()

  if (!usuario || (usuario.rol !== 'admin' && usuario.rol !== 'restringido')) redirect('/login')

  let items: AdminNavItem[]
  if (usuario.rol === 'admin') {
    items = usuario.superAdmin
      ? [...navItems, { href: '/usuarios', label: 'Usuarios y Permisos', icon: 'consignatarios' }]
      : navItems
  } else {
    items = filtrarNavItems(usuario.permisos).map((seccion) => ({
      href: seccion.href,
      label: seccion.label,
      icon: seccion.icon as AdminNavItem['icon'],
      external: seccion.external,
    }))
  }

  let novedadesNoLeidas = 0
  if (usuario.rol === 'admin') {
    try { novedadesNoLeidas = await contarNovedadesNoLeidas() } catch { /* skip */ }
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Sidebar - hidden on mobile, visible on md+ */}
      <AdminSidebar items={items} badgeCount={novedadesNoLeidas} />

      {/* Mobile menu */}
      <MobileMenu items={items.map(item => ({
        href: item.href,
        label: item.label,
        external: item.external,
      }))} />

      {/* Contenido */}
      <main className="flex-1 overflow-auto min-w-0">
        {children}
      </main>
    </div>
  )
}
