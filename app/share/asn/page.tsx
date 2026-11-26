export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { getAsnsPendientesPublico, getChecklistAsn } from '@/lib/actions/asn-control'
import ChecklistClient from './ChecklistClient'

// Link UNICO para el deposito de Andreani (provisorio): lista las ASN con
// celulares pendientes de control; dentro de cada una, checklist de IMEIs.
export default async function ShareAsnPage({ searchParams }: { searchParams: { token?: string; asn?: string } }) {
  const token = searchParams.token ?? ''
  const pendientes = token ? await getAsnsPendientesPublico(token) : null

  if (pendientes === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-400">Acceso no autorizado</p>
      </div>
    )
  }

  // Vista checklist de una ASN puntual
  if (searchParams.asn) {
    const checklist = await getChecklistAsn(token, searchParams.asn)
    if (!checklist) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <p className="text-gray-400">ASN inexistente</p>
        </div>
      )
    }
    return (
      <div className="min-h-screen bg-gray-50 py-4 px-3">
        <div className="max-w-3xl mx-auto">
          <ChecklistClient token={token} checklist={checklist} />
        </div>
      </div>
    )
  }

  // Vista lista: ASN pendientes de control
  return (
    <div className="min-h-screen bg-gray-50 py-6 px-4">
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h1 className="text-lg font-bold text-gray-900">Control de ingreso — GOCUOTAS</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            ASN con celulares pendientes de control. Entrá a la que estás recibiendo y escaneá los IMEIs.
          </p>
        </div>
        {pendientes.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-sm text-gray-500">
            No hay ASN pendientes de control. ¡Gracias!
          </div>
        ) : (
          <div className="space-y-2">
            {pendientes.map(a => (
              <Link
                key={a.asnId}
                href={`/share/asn?token=${token}&asn=${a.asnId}`}
                className="flex items-center justify-between bg-white border border-gray-200 rounded-xl px-5 py-4 hover:border-emerald-400 hover:shadow-sm transition"
              >
                <div>
                  <span className="font-bold text-gray-900">ASN #{a.transaccion}</span>
                  <span className="block text-xs text-gray-500">
                    enviada el {new Date(a.fecha).toLocaleDateString('es-AR')} · {a.imeis} celulares
                  </span>
                </div>
                <span className="text-emerald-600 font-semibold text-sm">Controlar →</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
