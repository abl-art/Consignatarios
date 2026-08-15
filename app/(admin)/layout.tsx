import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AdminSidebar, { type AdminNavItem } from '@/components/AdminSidebar'
import MobileMenu from '@/components/MobileMenu'
import { contarTacsPendientes } from '@/lib/actions/tacs'

const navItems: AdminNavItem[] = [
  { href: '/dashboard', label: 'Dashboard360', icon: 'dashboard' },
  { href: '/celia', label: 'Celia', icon: 'celia' },
  { href: 'https://gocelular.vercel.app/dashboard', label: 'Centro de Operaciones', icon: 'sync', external: true },
  { href: 'https://admin.gocuotas.com/admin/users', label: 'Administrador GOcuotas', icon: 'consignatarios', external: true },
  { href: '/canales', label: 'Canales de Comercialización', icon: 'tienda' },
  { href: 'https://drive.google.com/drive/folders/1Yr4u9OjJ6r4ct90Au3_yy47RFkhWOlbC', label: 'Marketing', icon: 'tienda', external: true },
  { href: '/alertas-fraudes', label: 'Alertas y Fraudes', icon: 'diferencias' },
  { href: '/compras', label: 'Compras', icon: 'fabrica' },
  { href: '/inventario', label: 'Inventario', icon: 'inventario' },
  // /modelos page kept for admin access but hidden from nav - managed via Compras now
  { href: '/finanzas', label: 'Finanzas', icon: 'finanzas' },
  { href: '/sync', label: 'Sincronización', icon: 'sync' },
  { href: '/documentacion', label: 'Documentación', icon: 'documento' },
  { href: '/notas', label: 'Notas y Pendientes', icon: 'reloj' },
  { href: '/gestion-tacs', label: 'Gestión TACs', icon: 'modelos', badge: true },
  { href: '/knox-guard', label: 'Knox Guard', icon: 'diferencias' },
  { href: '/grupo-go', label: 'Grupo GO', icon: 'dashboard' },
]

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user || user.user_metadata?.rol !== 'admin') redirect('/login')

  let tacsPendientes = 0
  try { tacsPendientes = await contarTacsPendientes() } catch { /* skip */ }

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Sidebar - hidden on mobile, visible on md+ */}
      <AdminSidebar items={navItems} tacsPendientes={tacsPendientes} />

      {/* Mobile menu */}
      <MobileMenu items={navItems.map(item => ({
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
