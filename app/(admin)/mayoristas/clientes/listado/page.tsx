import { getClientesMayoristas, crearClienteMayorista } from '@/lib/actions/clientes-mayoristas'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function ListadoClientesPage() {
  const clientes = await getClientesMayoristas()

  async function handleCrear(formData: FormData) {
    'use server'
    await crearClienteMayorista(formData)
  }

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <div className="flex items-center gap-2 mb-8">
        <Link href="/mayoristas/clientes" className="text-gray-400 hover:text-gray-600">← Clientes</Link>
        <h1 className="text-2xl font-bold text-gray-900">Listado de Clientes</h1>
      </div>

      {/* Formulario nuevo cliente */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 mb-8">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">
          Nuevo cliente mayorista
        </h2>
        <form action={handleCrear} className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Nombre comercial *</label>
            <input name="nombre_comercial" required placeholder="Ej: TecnoPlus"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Razón social</label>
            <input name="razon_social" placeholder="Ej: TecnoPlus SRL"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Condición IVA</label>
            <select name="condicion_iva"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white">
              <option value="monotributo">Monotributo</option>
              <option value="inscripto">Inscripto</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">CUIT</label>
            <input name="cuit" placeholder="Ej: 30-12345678-9"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Teléfono</label>
            <input name="telefono" placeholder="Opcional"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
            <input name="email" type="email" placeholder="Opcional"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Dirección de entrega</label>
            <input name="direccion_entrega" placeholder="Opcional"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Transporte</label>
            <input name="transporte" placeholder="Ej: Andreani, Via Cargo"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
          </div>
          <div className="col-span-2 flex justify-end">
            <button type="submit"
              className="px-5 py-2 bg-magenta-600 text-white text-sm font-medium rounded-lg hover:bg-magenta-700">
              Crear cliente
            </button>
          </div>
        </form>
      </div>

      {/* Tabla de clientes */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Nombre comercial</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Razón social</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">IVA</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">CUIT</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Teléfono</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Email</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Transporte</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {clientes.map((c) => (
              <tr key={c.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{c.nombre_comercial}</td>
                <td className="px-4 py-3 text-gray-600">{c.razon_social || '—'}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${c.condicion_iva === 'inscripto' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                    {c.condicion_iva === 'inscripto' ? 'Inscripto' : 'Monotributo'}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-600 font-mono text-xs">{c.cuit || '—'}</td>
                <td className="px-4 py-3 text-gray-600">{c.telefono || '—'}</td>
                <td className="px-4 py-3 text-gray-600">{c.email || '—'}</td>
                <td className="px-4 py-3 text-gray-600">{c.transporte || '—'}</td>
              </tr>
            ))}
            {clientes.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                  No hay clientes registrados
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
