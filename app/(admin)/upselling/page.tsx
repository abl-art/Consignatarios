export const dynamic = 'force-dynamic'

import { getUpselling } from '@/lib/actions/upselling'
import UpsellingTable from '@/components/upselling/UpsellingTable'

export default async function UpsellingPage() {
  const { filas, error } = await getUpselling()

  const contactados = filas.filter(f => f.contactadoAt).length
  const recompras = filas.filter(f => f.recompra).length

  return (
    <div className="p-4 md:p-8 max-w-full mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Upselling</h1>
      <p className="text-sm text-gray-500 mb-6">
        Clientes que terminaron de pagar todas las cuotas — candidatos a renovar el equipo
      </p>

      <div className="grid grid-cols-3 gap-4 mb-6 max-w-2xl">
        <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-gray-900">{filas.length}</p>
          <p className="text-xs text-gray-500">Clientes con cuotas al día</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-blue-700">{contactados}</p>
          <p className="text-xs text-gray-500">Contactados</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-green-700">{recompras}</p>
          <p className="text-xs text-gray-500">Volvieron a comprar</p>
        </div>
      </div>

      {error ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
          No se pudieron consultar los datos: {error}
        </div>
      ) : (
        <UpsellingTable filas={filas} />
      )}
    </div>
  )
}
