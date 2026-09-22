import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AdminSidebar, { type AdminNavItem } from '@/components/AdminSidebar'
import MobileMenu from '@/components/MobileMenu'
import { contarNovedadesNoLeidas } from '@/lib/actions/novedades'

const navItems: AdminNavItem[] = [
  { href: '/novedades', label: 'Novedades', icon: 'novedades', badge: true },
  { href: '/dashboard', label: 'Dashboard360', icon: 'dashboard' },
  { href: '/celia', label: 'Celia', icon: 'celia' },
  { href: 'https://gocelular.vercel.app/dashboard', label: 'Centro de Operaciones', icon: 'sync', external: true },
  { href: 'https://admin.gocuotas.com/admin/users', label: 'Administrador GOcuotas', icon: 'consignatarios', external: true },
  { href: '/canales', label: 'Canales de Comercialización', icon: 'tienda' },
  { href: '/alertas-fraudes', label: 'Alertas y Fraudes', icon: 'diferencias' },
  { href: '/compras', label: 'Compras', icon: 'fabrica' },
  { href: '/inventario', label: 'Inventario', icon: 'inventario' },
  // /modelos page kept for admin access but hidden from nav - managed via Compras now
  { href: '/finanzas', label: 'Finanzas', icon: 'finanzas' },
  { href: '/sync', label: 'Sincronización', icon: 'sync' },
  { href: '/documentacion', label: 'Documentación', icon: 'documento' },
  { href: '/notas', label: 'Notas y Pendientes', icon: 'reloj' },
  { href: '/knox-guard', label: 'Knox Guard', icon: 'diferencias' },
  { href: '/grupo-go', label: 'Grupo GO', icon: 'dashboard' },
]

// Rol visor: acceso de solo consulta a estas tres secciones (el middleware bloquea el resto)
const navItemsVisor: AdminNavItem[] = [
  { href: '/dashboard', label: 'Dashboard360', icon: 'dashboard' },
  { href: '/alertas-fraudes', label: 'Alertas y Fraudes', icon: 'diferencias' },
  { href: '/terceros', label: 'Venta a Terceros', icon: 'ventas' },
]

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const rol = user?.user_metadata?.rol
  if (!user || (rol !== 'admin' && rol !== 'visor')) redirect('/login')

  const items = rol === 'visor' ? navItemsVisor : navItems

  let novedadesNoLeidas = 0
  if (rol === 'admin') {
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
