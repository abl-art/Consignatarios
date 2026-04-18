import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { fetchVentasPorModelo } from '@/lib/gocelular'
import ModelosChart from './ModelosChart'

export default async function CelularesPage() {
  const supabase = createClient()
  const [ventasModelos, { data: consigs }] = await Promise.all([
    fetchVentasPorModelo(),
    supabase.from('consignatarios').select('nombre, store_prefix'),
  ])

  const prefixes = (consigs ?? [])
    .filter((c: { store_prefix: string | null }) => c.store_prefix)
    .map((c: { nombre: string; store_prefix: string | null }) => ({
      nombre: c.nombre,
      prefix: c.store_prefix!.toLowerCase(),
    }))

  const subpages = [
    { href: '/asignar', label: 'Asignar stock' },
    { href: '/inventario/tenencia', label: 'Tenencia consignatarios' },
    { href: '/inventario/tenencia-propia', label: 'Tenencia propia' },
  ]

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Celulares</h1>
      <p className="text-sm text-gray-500 mb-6">Inventario de celulares</p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {subpages.map((sp) => (
          <Link
            key={sp.href}
            href={sp.href}
            className="bg-white border border-gray-200 rounded-xl p-6 hover:border-magenta-300 hover:shadow-sm transition-all"
          >
            <h3 className="text-base font-semibold text-gray-900 mb-1">{sp.label}</h3>
            <p className="text-xs text-gray-500">Ver →</p>
          </Link>
        ))}
      </div>

      <ModelosChart data={ventasModelos} prefixes={prefixes} />
    </div>
  )
}
