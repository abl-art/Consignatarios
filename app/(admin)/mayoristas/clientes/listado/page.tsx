import { getClientesMayoristas, crearClienteMayorista } from '@/lib/actions/clientes-mayoristas'
import Link from 'next/link'
import ClientesListado from './ClientesListado'

export const dynamic = 'force-dynamic'

export default async function ListadoClientesPage() {
  const clientes = await getClientesMayoristas()

  async function handleCrear(formData: FormData) {
    'use server'
    await crearClienteMayorista(formData)
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <div className="flex items-center gap-2 mb-1">
        <Link href="/mayoristas/clientes" className="text-gray-400 hover:text-gray-600 text-sm">← Clientes</Link>
      </div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Listado de Clientes</h1>
      <p className="text-sm text-gray-500 mb-6">Crear, editar y gestionar clientes mayoristas</p>

      {/* Formulario nuevo cliente */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Nuevo cliente mayorista</h2>
        <form action={handleCrear} className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
            <label className="block text-xs font-medium text-gray-600 mb-1">Transporte</label>
            <input name="transporte" placeholder="Ej: Andreani"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Límite cuenta corriente</label>
            <input name="limite_cuenta_corriente" type="number" placeholder="Sin límite"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
          </div>
          <input type="hidden" name="direccion_entrega" value="" />
          <div className="col-span-2 md:col-span-4 flex justify-end">
            <button type="submit"
              className="px-5 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 transition-colors">
              Crear cliente
            </button>
          </div>
        </form>
      </div>

      {/* Tabla editable */}
      <p className="text-xs text-gray-400 mb-2">Click en una fila para editar</p>
      <ClientesListado clientes={clientes} />
    </div>
  )
}
