import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchVentasPorModelo } from '@/lib/gocelular'
import { getPedidos } from '@/lib/actions/compras'
import ModelosChart from './ModelosChart'

export default async function CelularesPage() {
  const supabase = createClient()
  const admin = createAdminClient()

  const [ventasGocelular, { data: consigs }, { data: ventasConsig }, pedidos] = await Promise.all([
    fetchVentasPorModelo(),
    supabase.from('consignatarios').select('nombre, store_prefix'),
    admin.from('ventas').select('fecha_venta, dispositivos(modelos(marca, modelo))'),
    getPedidos(),
  ])

  // Pedidos en tránsito (enviados, no entregados)
  const enTransito = pedidos.filter(p => p.estado === 'enviado' && !p.entregadoAt)

  const prefixes = (consigs ?? [])
    .filter((c: { store_prefix: string | null }) => c.store_prefix)
    .map((c: { nombre: string; store_prefix: string | null }) => ({
      nombre: c.nombre,
      prefix: c.store_prefix!.toLowerCase(),
    }))

  const ventasConsigModelos = (ventasConsig ?? []).map((v: Record<string, unknown>) => {
    const disp = v.dispositivos as Record<string, unknown> | null
    const mod = disp?.modelos as { marca: string; modelo: string } | null
    return {
      fecha: v.fecha_venta as string,
      modelo: mod ? `${mod.marca} ${mod.modelo}` : 'Desconocido',
      ventas: 1,
      canal: 'consignatarios' as const,
    }
  })

  const combined = [
    ...ventasGocelular
      .filter(v => v.store_name.toLowerCase().startsWith('ecommerce'))
      .map(v => ({ fecha: v.fecha, modelo: v.modelo, ventas: v.ventas, canal: 'gocelular' as const })),
    ...ventasConsigModelos,
  ]

  const subpages = [
    { href: '/asignar', label: 'Asignar stock' },
    { href: '/inventario/tenencia', label: 'Tenencia consignatarios' },
    { href: '/inventario/tenencia-propia', label: 'Tenencia propia' },
    { href: '/inventario/celulares/compras', label: 'Recomendación de Compra' },
  ]

  // Build transit summary by model and proveedor
  const transitSummary: { modelo: string; cantidad: number; proveedor: string }[] = []
  enTransito.forEach(p => {
    p.items.forEach(item => {
      const existing = transitSummary.find(t => t.modelo === item.productoNombre && t.proveedor === p.proveedorNombre)
      if (existing) {
        existing.cantidad += item.cantidad
      } else {
        transitSummary.push({ modelo: item.productoNombre, cantidad: item.cantidad, proveedor: p.proveedorNombre })
      }
    })
  })
  transitSummary.sort((a, b) => b.cantidad - a.cantidad)

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Celulares</h1>
      <p className="text-sm text-gray-500 mb-6">Inventario de celulares</p>

      <div className={`grid grid-cols-2 ${enTransito.length > 0 ? 'md:grid-cols-5' : 'md:grid-cols-4'} gap-4 mb-6`}>
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
        {enTransito.length > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
            <h3 className="text-base font-semibold text-blue-800 mb-1">Pedidos en tránsito</h3>
            <p className="text-2xl font-bold text-blue-700">{transitSummary.reduce((s, t) => s + t.cantidad, 0)} u.</p>
            <p className="text-xs text-blue-500">{enTransito.length} pedido{enTransito.length !== 1 ? 's' : ''}</p>
          </div>
        )}
      </div>

      {/* Transit detail */}
      {transitSummary.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 mb-6">
          <h3 className="text-sm font-semibold text-blue-800 mb-3">Detalle de pedidos en tránsito</h3>
          <div className="overflow-hidden rounded-lg border border-blue-200">
            <table className="w-full text-sm">
              <thead className="bg-blue-100">
                <tr>
                  <th className="text-left px-4 py-2 font-medium text-blue-800">Modelo</th>
                  <th className="text-center px-4 py-2 font-medium text-blue-800">Cantidad</th>
                  <th className="text-left px-4 py-2 font-medium text-blue-800">Proveedor</th>
                </tr>
              </thead>
              <tbody className="bg-white">
                {transitSummary.map((t, i) => (
                  <tr key={i} className="border-t border-blue-100">
                    <td className="px-4 py-2 text-gray-900">{t.modelo}</td>
                    <td className="px-4 py-2 text-center font-bold text-blue-700">{t.cantidad}</td>
                    <td className="px-4 py-2 text-gray-600">{t.proveedor}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <ModelosChart data={combined} />
    </div>
  )
}
