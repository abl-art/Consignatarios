'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { confirmarAsignacion } from '@/lib/actions/asignar'
import FirmaCanvas from '@/components/FirmaCanvas'

interface Borrador {
  id: string
  fecha: string
  total_unidades: number
  consignatarios: { nombre: string } | null
  asignacion_items: { dispositivo_id: string; dispositivos: { imei: string; modelos: { marca: string; modelo: string } | null } | null }[]
}

export default function BorradoresList({ borradores }: { borradores: Borrador[] }) {
  const router = useRouter()
  const [confirming, setConfirming] = useState<string | null>(null)
  const [firmadoPor, setFirmadoPor] = useState('')
  const [firma, setFirma] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)

  if (borradores.length === 0) return null

  async function handleConfirm(id: string) {
    if (!firmadoPor.trim() || !firma) return
    setLoading(true)
    await confirmarAsignacion(id, firmadoPor.trim(), firma)
    setLoading(false)
    setConfirming(null)
    setFirmadoPor('')
    setFirma(null)
    router.refresh()
  }

  return (
    <div className="bg-white border border-amber-200 rounded-xl overflow-hidden">
      <div className="bg-amber-50 px-6 py-4 border-b border-amber-200">
        <h3 className="text-sm font-semibold text-amber-800">Borradores pendientes de entrega ({borradores.length})</h3>
        <p className="text-xs text-amber-600">Equipos preparados en depósito — pendientes de firma del consignatario</p>
      </div>

      <div className="divide-y divide-gray-100">
        {borradores.map(b => {
          const isExpanded = expanded === b.id
          const isConfirming = confirming === b.id

          // Group items by model
          const byModel: Record<string, { marca: string; modelo: string; imeis: string[] }> = {}
          b.asignacion_items.forEach(item => {
            const marca = item.dispositivos?.modelos?.marca || 'Desconocido'
            const modelo = item.dispositivos?.modelos?.modelo || 'Desconocido'
            const key = `${marca}|${modelo}`
            if (!byModel[key]) byModel[key] = { marca, modelo, imeis: [] }
            byModel[key].imeis.push(item.dispositivos?.imei || '?')
          })

          return (
            <div key={b.id}>
              <button
                type="button"
                onClick={() => setExpanded(isExpanded ? null : b.id)}
                className="w-full px-6 py-3 flex items-center justify-between hover:bg-gray-50 text-left"
              >
                <div className="flex items-center gap-3">
                  <span className="text-gray-400">{isExpanded ? '▾' : '▸'}</span>
                  <div>
                    <span className="font-medium text-gray-900">{b.consignatarios?.nombre}</span>
                    <span className="text-xs text-gray-500 ml-3">{b.fecha}</span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-amber-100 text-amber-700">
                    Borrador
                  </span>
                  <span className="text-sm text-gray-500">{b.total_unidades} equipos</span>
                </div>
              </button>

              {isExpanded && (
                <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 space-y-3">
                  {/* Items by model */}
                  {Object.values(byModel).map(g => (
                    <div key={`${g.marca}-${g.modelo}`} className="text-sm">
                      <span className="font-medium text-gray-800">{g.marca} {g.modelo}</span>
                      <span className="text-gray-500 ml-2">× {g.imeis.length}</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {g.imeis.map(imei => (
                          <span key={imei} className="font-mono text-[10px] bg-white px-2 py-0.5 rounded border border-gray-200 text-gray-600">{imei}</span>
                        ))}
                      </div>
                    </div>
                  ))}

                  {/* Confirm button or firma form */}
                  {!isConfirming ? (
                    <button
                      onClick={() => setConfirming(b.id)}
                      className="mt-3 px-5 py-2 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700 transition-colors"
                    >
                      Confirmar entrega
                    </button>
                  ) : (
                    <div className="mt-3 bg-white border border-gray-200 rounded-xl p-5 space-y-4">
                      <h4 className="text-sm font-semibold text-gray-700">Firma del consignatario</h4>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Recibido por</label>
                        <input
                          type="text"
                          value={firmadoPor}
                          onChange={(e) => setFirmadoPor(e.target.value)}
                          placeholder="Nombre de quien recibe"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        />
                      </div>
                      <FirmaCanvas onSave={(base64) => setFirma(base64)} />
                      {firma && <p className="text-xs text-green-600 font-medium">Firma capturada</p>}
                      <div className="flex gap-3 justify-end">
                        <button
                          type="button"
                          onClick={() => { setConfirming(null); setFirma(null); setFirmadoPor('') }}
                          className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleConfirm(b.id)}
                          disabled={!firmadoPor.trim() || !firma || loading}
                          className="px-5 py-2 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700 disabled:opacity-40 transition-colors"
                        >
                          {loading ? 'Confirmando...' : 'Confirmar y generar remito'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
