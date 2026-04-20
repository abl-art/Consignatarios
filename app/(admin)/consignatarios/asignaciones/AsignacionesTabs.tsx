'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { confirmarAsignacion, eliminarBorrador } from '@/lib/actions/asignar'
import FirmaCanvas from '@/components/FirmaCanvas'

interface Asignacion {
  id: string
  consignatario_id: string
  fecha: string
  total_unidades: number
  total_valor_costo: number
  total_valor_venta: number
  firmado_por: string | null
  firma_url: string | null
  consignatarios: { nombre: string } | null
  asignacion_items: { dispositivo_id: string; dispositivos: { imei: string; modelos: { marca: string; modelo: string } | null } | null }[]
}

function groupByModel(items: Asignacion['asignacion_items']) {
  const map: Record<string, { marca: string; modelo: string; imeis: string[] }> = {}
  items.forEach(item => {
    const marca = item.dispositivos?.modelos?.marca || '?'
    const modelo = item.dispositivos?.modelos?.modelo || '?'
    const key = `${marca}|${modelo}`
    if (!map[key]) map[key] = { marca, modelo, imeis: [] }
    map[key].imeis.push(item.dispositivos?.imei || '?')
  })
  return Object.values(map)
}

export default function AsignacionesTabs({ borradores, confirmados }: { borradores: Asignacion[]; confirmados: Asignacion[] }) {
  const router = useRouter()
  const [tab, setTab] = useState<'borradores' | 'confirmados'>(borradores.length > 0 ? 'borradores' : 'confirmados')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)
  const [firmadoPor, setFirmadoPor] = useState('')
  const [firma, setFirma] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleConfirm(id: string) {
    if (!firmadoPor.trim() || !firma) return
    setLoading(true)
    await confirmarAsignacion(id, firmadoPor.trim(), firma)
    setLoading(false)
    setConfirming(null)
    setFirmadoPor('')
    setFirma(null)
    setExpanded(null)
    router.refresh()
  }

  const tabs = [
    { key: 'borradores' as const, label: `Borradores (${borradores.length})` },
    { key: 'confirmados' as const, label: `Confirmados (${confirmados.length})` },
  ]

  const currentList = tab === 'borradores' ? borradores : confirmados

  return (
    <div>
      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-6">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => { setTab(t.key); setExpanded(null); setConfirming(null) }}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key ? 'border-magenta-600 text-magenta-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {currentList.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-gray-400 text-sm">
            {tab === 'borradores' ? 'No hay borradores pendientes' : 'No hay asignaciones confirmadas'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {currentList.map(a => {
            const isExpanded = expanded === a.id
            const isConfirming = confirming === a.id
            const models = groupByModel(a.asignacion_items)

            return (
              <div key={a.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setExpanded(isExpanded ? null : a.id)}
                  className="w-full px-5 py-4 flex items-center justify-between hover:bg-gray-50 text-left"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-gray-400">{isExpanded ? '▾' : '▸'}</span>
                    <div>
                      <span className="font-semibold text-gray-900">{a.consignatarios?.nombre}</span>
                      <span className="text-xs text-gray-500 ml-3">{a.fecha}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`px-2.5 py-1 text-xs font-semibold rounded-full ${
                      a.firma_url ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                    }`}>
                      {a.firma_url ? 'Confirmado' : 'Borrador'}
                    </span>
                    <span className="text-sm text-gray-500">{a.total_unidades} equipos</span>
                  </div>
                </button>

                {isExpanded && (
                  <div className="px-5 py-4 bg-gray-50 border-t border-gray-100 space-y-3">
                    {models.map(g => (
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

                    {a.firmado_por && (
                      <div className="text-xs text-gray-500 pt-2 border-t border-gray-200">
                        Recibido por: <span className="font-medium text-gray-700">{a.firmado_por}</span>
                      </div>
                    )}

                    {/* Actions for borradores */}
                    {tab === 'borradores' && !isConfirming && (
                      <div className="flex gap-3 mt-2">
                        <button
                          onClick={() => setConfirming(a.id)}
                          className="px-5 py-2 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700 transition-colors"
                        >
                          Confirmar entrega
                        </button>
                        <button
                          onClick={async () => {
                            if (!confirm('¿Eliminar este borrador? Los equipos volverán al stock disponible.')) return
                            setLoading(true)
                            await eliminarBorrador(a.id)
                            setLoading(false)
                            router.refresh()
                          }}
                          disabled={loading}
                          className="px-4 py-2 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-40 transition-colors"
                        >
                          Eliminar borrador
                        </button>
                      </div>
                    )}

                    {isConfirming && (
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
                          <button type="button" onClick={() => { setConfirming(null); setFirma(null); setFirmadoPor('') }} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancelar</button>
                          <button
                            type="button"
                            onClick={() => handleConfirm(a.id)}
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
      )}
    </div>
  )
}
