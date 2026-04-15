import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { formatearMoneda, calcularPrecioVenta } from '@/lib/utils'
import type { Modelo, Config } from '@/lib/types'

async function actualizarMultiplicador(formData: FormData) {
  'use server'
  const supabase = createClient()
  const multiplicador = parseFloat(formData.get('multiplicador') as string)
  if (isNaN(multiplicador) || multiplicador <= 0) return
  await supabase.from('config').update({ multiplicador, updated_at: new Date().toISOString() }).neq('id', '')
  revalidatePath('/modelos')
}

async function crearModelo(formData: FormData) {
  'use server'
  const supabase = createClient()
  const marca = (formData.get('marca') as string).trim()
  const modelo = (formData.get('modelo') as string).trim()
  const precio_costo = parseFloat(formData.get('precio_costo') as string)
  if (!marca || !modelo || isNaN(precio_costo)) return
  await supabase.from('modelos').insert({ marca, modelo, precio_costo })
  revalidatePath('/modelos')
}

async function eliminarModelo(id: string) {
  'use server'
  const supabase = createClient()
  await supabase.from('modelos').delete().eq('id', id)
  revalidatePath('/modelos')
}

export default async function ModelosPage() {
  const supabase = createClient()
  const [{ data: config }, { data: modelos }] = await Promise.all([
    supabase.from('config').select('*').single<Config>(),
    supabase.from('modelos').select('*').order('marca').returns<Modelo[]>(),
  ])

  const multiplicador = config?.multiplicador ?? 1.8

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-8">Modelos y precios</h1>

      {/* Multiplicador global */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 mb-8">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">
          Multiplicador global de precio
        </h2>
        <form action={actualizarMultiplicador} className="flex items-end gap-4">
          <div>
            <label className="block text-sm text-gray-600 mb-1">
              Multiplicador actual: <strong>{multiplicador}</strong>
            </label>
            <input
              name="multiplicador"
              type="number"
              step="0.01"
              min="0.01"
              defaultValue={multiplicador}
              className="w-32 px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
          >
            Actualizar
          </button>
        </form>
      </div>

      {/* Agregar modelo */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 mb-8">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">
          Agregar modelo
        </h2>
        <form action={crearModelo} className="flex gap-3 flex-wrap">
          <input
            name="marca"
            placeholder="Marca (ej: Samsung)"
            required
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm w-40"
          />
          <input
            name="modelo"
            placeholder="Modelo (ej: A54)"
            required
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm w-48"
          />
          <input
            name="precio_costo"
            type="number"
            step="0.01"
            min="0"
            placeholder="Precio costo"
            required
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm w-36"
          />
          <button
            type="submit"
            className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700"
          >
            Agregar
          </button>
        </form>
      </div>

      {/* Lista de modelos */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-6 py-3 font-medium text-gray-600">Marca</th>
              <th className="text-left px-6 py-3 font-medium text-gray-600">Modelo</th>
              <th className="text-right px-6 py-3 font-medium text-gray-600">Precio costo</th>
              <th className="text-right px-6 py-3 font-medium text-gray-600">Precio venta</th>
              <th className="px-6 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {modelos?.map((m) => (
              <tr key={m.id} className="hover:bg-gray-50">
                <td className="px-6 py-3 text-gray-900">{m.marca}</td>
                <td className="px-6 py-3 text-gray-900">{m.modelo}</td>
                <td className="px-6 py-3 text-right text-gray-700">{formatearMoneda(m.precio_costo)}</td>
                <td className="px-6 py-3 text-right font-medium text-gray-900">
                  {formatearMoneda(calcularPrecioVenta(m.precio_costo, multiplicador))}
                </td>
                <td className="px-6 py-3 text-right">
                  <form action={eliminarModelo.bind(null, m.id)}>
                    <button type="submit" className="text-red-500 hover:text-red-700 text-xs">
                      Eliminar
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {(!modelos || modelos.length === 0) && (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-gray-400">
                  No hay modelos cargados
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
