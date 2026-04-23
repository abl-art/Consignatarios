import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import ModeloRow from './ModeloRow'
import type { Modelo } from '@/lib/types'

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

export default async function ModelosPage() {
  const supabase = createClient()
  const { data: modelos } = await supabase.from('modelos').select('*').order('marca').returns<Modelo[]>()

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-8">Modelos y precios</h1>

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
              <th className="px-6 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {modelos?.map((m) => (
              <ModeloRow key={m.id} modelo={m} />
            ))}
            {(!modelos || modelos.length === 0) && (
              <tr>
                <td colSpan={4} className="px-6 py-8 text-center text-gray-400">
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
