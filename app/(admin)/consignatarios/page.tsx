export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

export default async function ConsignatariosHubPage() {
  const supabase = createClient()

  const [
    { count: totalConsignatarios },
    { count: stockAsignado },
    { count: liquidacionesPendientes },
    { count: asignacionesBorrador },
  ] = await Promise.all([
    supabase.from('consignatarios').select('*', { count: 'exact', head: true }),
    supabase.from('dispositivos').select('*', { count: 'exact', head: true }).eq('estado', 'asignado'),
    supabase.from('liquidaciones').select('*', { count: 'exact', head: true }).eq('estado', 'pendiente'),
    supabase.from('asignaciones').select('*', { count: 'exact', head: true }).eq('estado', 'borrador'),
  ])

  const cards = [
    {
      href: '/consignatarios/lista',
      title: 'Consignatarios',
      description: 'Lista de consignatarios, crear nuevos y ver detalle de cada uno',
      count: totalConsignatarios ?? 0,
      countLabel: 'consignatarios activos',
      color: 'amber',
      iconPath: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z',
    },
    {
      href: '/consignatarios/dashboard',
      title: 'Dashboard',
      description: 'KPIs, análisis de rendimiento y métricas de consignación',
      count: stockAsignado ?? 0,
      countLabel: 'equipos en consignación',
      color: 'blue',
      iconPath: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
    },
    {
      href: '/consignatarios/asignaciones',
      title: 'Asignaciones',
      description: 'Asignar equipos a consignatarios (borradores y confirmadas)',
      count: asignacionesBorrador ?? 0,
      countLabel: 'borradores pendientes',
      color: 'emerald',
      iconPath: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4',
    },
    {
      href: '/liquidaciones',
      title: 'Liquidaciones',
      description: 'Generar, revisar y pagar liquidaciones de comisiones',
      count: liquidacionesPendientes ?? 0,
      countLabel: 'pendientes de pago',
      color: 'rose',
      iconPath: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
    },
    {
      href: '/consignatarios/devoluciones',
      title: 'Devoluciones',
      description: 'Devolver equipos de consignatarios al stock central',
      color: 'purple',
      iconPath: 'M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6',
    },
    {
      href: '/consignatarios/credenciales',
      title: 'Credenciales',
      description: 'Gestionar usuarios y contraseñas de acceso al portal',
      color: 'indigo',
      iconPath: 'M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z',
    },
  ]

  const colorClasses: Record<string, { bg: string; badge: string }> = {
    amber: { bg: 'bg-amber-600', badge: 'bg-amber-100 text-amber-700' },
    blue: { bg: 'bg-blue-600', badge: 'bg-blue-100 text-blue-700' },
    emerald: { bg: 'bg-emerald-600', badge: 'bg-emerald-100 text-emerald-700' },
    rose: { bg: 'bg-rose-600', badge: 'bg-rose-100 text-rose-700' },
    purple: { bg: 'bg-purple-600', badge: 'bg-purple-100 text-purple-700' },
    indigo: { bg: 'bg-indigo-600', badge: 'bg-indigo-100 text-indigo-700' },
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <Link href="/canales" className="text-gray-400 hover:text-gray-600 text-sm">← Canales</Link>
      <h1 className="text-2xl font-bold text-gray-900 mb-1 mt-2">Consignatarios</h1>
      <p className="text-sm text-gray-500 mb-6">Stock en consignación en locales de terceros</p>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {cards.map((card) => {
          const c = colorClasses[card.color]
          return (
            <Link
              key={card.href}
              href={card.href}
              className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-lg transition-shadow group"
            >
              <div className={`${c.bg} px-5 py-4 flex items-center gap-3`}>
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={card.iconPath} />
                </svg>
                <h2 className="text-lg font-semibold text-white">{card.title}</h2>
              </div>
              <div className="p-5">
                <p className="text-sm text-gray-500 mb-4">{card.description}</p>
                {'count' in card && card.count !== undefined && (
                  <span className={`inline-block px-3 py-1 text-xs font-semibold rounded-full ${c.badge}`}>
                    {card.count} {card.countLabel}
                  </span>
                )}
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
