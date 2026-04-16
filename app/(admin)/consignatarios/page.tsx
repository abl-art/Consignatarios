import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Consignatario } from '@/lib/types'
import { formatearMoneda } from '@/lib/utils'

async function crearConsignatario(formData: FormData) {
  'use server'
  const nombre = (formData.get('nombre') as string).trim()
  const email = (formData.get('email') as string).trim()
  const password = (formData.get('password') as string).trim()
  const telefono = (formData.get('telefono') as string).trim()
  const comision = parseFloat(formData.get('comision_porcentaje') as string) / 100
  const punto_reorden = parseInt(formData.get('punto_reorden') as string)
  const garantia = parseFloat(formData.get('garantia') as string) || 0
  const storePrefix = (formData.get('store_prefix') as string).trim() || null

  if (!nombre || !email || !password || password.length < 6) return

  // Crear usuario en Supabase Auth con la contraseña del admin
  const adminClient = createAdminClient()
  const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { rol: 'consignatario' },
  })
  if (authError || !authData.user) return

  const supabase = createClient()
  await supabase.from('consignatarios').insert({
    nombre,
    email,
    telefono: telefono || null,
    comision_porcentaje: comision,
    punto_reorden: isNaN(punto_reorden) ? 10 : punto_reorden,
    garantia,
    store_prefix: storePrefix,
    user_id: authData.user.id,
  })
  revalidatePath('/consignatarios')
}

export default async function ConsignatariosPage() {
  const supabase = createClient()
  const { data: consignatarios } = await supabase
    .from('consignatarios')
    .select('*')
    .order('nombre')
    .returns<Consignatario[]>()

  // Stock actual por consignatario
  const { data: stockPorConsignatario } = await supabase
    .from('dispositivos')
    .select('consignatario_id')
    .eq('estado', 'asignado')

  const stockMap = (stockPorConsignatario ?? []).reduce<Record<string, number>>((acc, d) => {
    if (d.consignatario_id) {
      acc[d.consignatario_id] = (acc[d.consignatario_id] ?? 0) + 1
    }
    return acc
  }, {})

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-8">Consignatarios</h1>

      {/* Formulario nuevo consignatario */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 mb-8">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">
          Nuevo consignatario
        </h2>
        <form action={crearConsignatario} className="grid grid-cols-2 gap-4">
          {/* Fila 1 */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Nombre</label>
            <input name="nombre" placeholder="Ej: Juan Pérez" required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
            <input name="email" type="email" placeholder="email@dominio.com" required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
          </div>

          {/* Fila 2 */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Contraseña <span className="text-gray-400 font-normal">(mín. 6)</span>
            </label>
            <input name="password" type="text" minLength={6} placeholder="Ej: juanperez2026" required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Teléfono</label>
            <input name="telefono" placeholder="Opcional"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
          </div>

          {/* Fila 3 */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Comisión (%)</label>
            <input name="comision_porcentaje" type="number" step="0.1" min="0" max="100"
              placeholder="10" defaultValue={10}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Punto de reorden</label>
            <input name="punto_reorden" type="number" min="0" placeholder="10"
              defaultValue={10}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
          </div>

          {/* Fila 4 */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Garantía (pesos)</label>
            <input name="garantia" type="number" step="1000" min="0" placeholder="Ej: 3000000"
              defaultValue={0}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Prefijo sucursal</label>
            <input name="store_prefix" placeholder="Ej: RIIIN (opcional)"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
          </div>

          {/* Fila 5: botón */}
          <div className="col-span-2 flex justify-end">
            <button type="submit"
              className="px-5 py-2 bg-magenta-600 text-white text-sm font-medium rounded-lg hover:bg-magenta-700">
              Crear consignatario
            </button>
          </div>
        </form>
      </div>

      {/* Lista */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-6 py-3 font-medium text-gray-600">Nombre</th>
              <th className="text-left px-6 py-3 font-medium text-gray-600">Email</th>
              <th className="text-right px-6 py-3 font-medium text-gray-600">Stock actual</th>
              <th className="text-right px-6 py-3 font-medium text-gray-600">Garantía</th>
              <th className="text-right px-6 py-3 font-medium text-gray-600">Comisión</th>
              <th className="px-6 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {consignatarios?.map((c) => {
              const stock = stockMap[c.id] ?? 0
              const alerta = stock <= c.punto_reorden
              return (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-6 py-3 font-medium text-gray-900">{c.nombre}</td>
                  <td className="px-6 py-3 text-gray-600">{c.email}</td>
                  <td className="px-6 py-3 text-right">
                    <span className={alerta ? 'text-orange-600 font-semibold' : 'text-gray-900'}>
                      {stock} {alerta && '⚠'}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-right text-gray-700">
                    {formatearMoneda(c.garantia ?? 0)}
                  </td>
                  <td className="px-6 py-3 text-right text-gray-700">
                    {(c.comision_porcentaje * 100).toFixed(1)}%
                  </td>
                  <td className="px-6 py-3 text-right">
                    <Link href={`/consignatarios/${c.id}`}
                      className="text-magenta-600 hover:text-magenta-800 text-xs font-medium">
                      Ver detalle →
                    </Link>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
