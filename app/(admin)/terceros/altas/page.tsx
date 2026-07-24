import { fetchTercerosAltas, fetchTercerosVentasDiarias } from '@/lib/actions/crm-terceros'
import Link from 'next/link'
import AltasClient from './AltasClient'

export default async function AltasPage() {
  const [terceros, ventasDiarias] = await Promise.all([
    fetchTercerosAltas(),
    fetchTercerosVentasDiarias(),
  ])

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-1">
        <Link href="/terceros" className="text-gray-400 hover:text-gray-600 text-sm">← Terceros</Link>
        <span className="text-gray-300 text-sm">/</span>
        <Link href="/canales" className="text-gray-400 hover:text-gray-600 text-sm">← Canales</Link>
      </div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Altas - Terceros Activos</h1>
      <p className="text-sm text-gray-500 mb-6">Merchants dados de alta en GOcelular</p>

      {terceros.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center text-gray-400 text-sm">
          No hay terceros activos.
        </div>
      ) : (
        <AltasClient terceros={terceros} ventasDiarias={ventasDiarias} />
      )}
    </div>
  )
}
