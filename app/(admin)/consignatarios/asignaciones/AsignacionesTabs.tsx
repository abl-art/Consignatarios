'use client'

import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { confirmarAsignacion, eliminarBorrador, prepararAsignacionMayorista } from '@/lib/actions/asignar'
import { formatearMoneda } from '@/lib/utils'
import FirmaCanvas from '@/components/FirmaCanvas'
import type { ProformaConItems } from '@/lib/actions/proformas'
import type { DispositivoConModelo } from '@/lib/types'

interface Asignacion {
  id: string
  consignatario_id: string | null
  proforma_id: string | null
  fecha: string
  total_unidades: number
  total_valor_costo: number
  total_valor_venta: number
  firmado_por: string | null
  firma_url: string | null
  consignatarios: { nombre: string } | null
  asignacion_items: { dispositivo_id: string; dispositivos: { imei: string; modelos: { marca: string; modelo: string } | null } | null }[]
}

interface Props {
  consigBorradores: Asignacion[]
  consigConfirmados: Asignacion[]
  mayoristaBorradores: Asignacion[]
  mayoristaConfirmados: Asignacion[]
  proformasConfirmadas: ProformaConItems[]
  dispositivos: DispositivoConModelo[]
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

export default function AsignacionesTabs({
  consigBorradores, consigConfirmados,
  mayoristaBorradores, mayoristaConfirmados,
  proformasConfirmadas, dispositivos,
}: Props) {
  const router = useRouter()
  const [modo, setModo] = useState<'consignatarios' | 'mayorista'>('consignatarios')

  return (
    <div>
      {/* Mode switch */}
      <div className="flex gap-2 mb-6">
        {([
          { key: 'consignatarios' as const, label: 'Consignatarios' },
          { key: 'mayorista' as const, label: 'Venta Mayorista' },
        ]).map(m => (
          <button
            key={m.key}
            onClick={() => setModo(m.key)}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              modo === m.key
                ? 'bg-magenta-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {modo === 'consignatarios' ? (
        <AsignacionesConsignatarios borradores={consigBorradores} confirmados={consigConfirmados} />
      ) : (
        <AsignacionesMayorista
          borradores={mayoristaBorradores}
          confirmados={mayoristaConfirmados}
          proformasConfirmadas={proformasConfirmadas}
          dispositivos={dispositivos}
        />
      )}
    </div>
  )
}

// =====================================================================
// Consignatarios (original)
// =====================================================================

function AsignacionesConsignatarios({ borradores, confirmados }: { borradores: Asignacion[]; confirmados: Asignacion[] }) {
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

// =====================================================================
// Venta Mayorista
// =====================================================================

function AsignacionesMayorista({
  borradores, confirmados, proformasConfirmadas, dispositivos,
}: {
  borradores: Asignacion[]
  confirmados: Asignacion[]
  proformasConfirmadas: ProformaConItems[]
  dispositivos: DispositivoConModelo[]
}) {
  const router = useRouter()
  const [asignandoProformaId, setAsignandoProformaId] = useState<string | null>(null)

  // Contar equipos ya asignados por proforma
  const todasAsignaciones = [...borradores, ...confirmados]
  const equiposAsignadosPorProforma = new Map<string, number>()
  for (const a of todasAsignaciones) {
    if (!a.proforma_id) continue
    const prev = equiposAsignadosPorProforma.get(a.proforma_id) ?? 0
    equiposAsignadosPorProforma.set(a.proforma_id, prev + a.total_unidades)
  }

  // Una proforma está completa solo si se asignaron todos los equipos pedidos
  const proformasPendientes = proformasConfirmadas.filter(p => {
    const totalPedido = p.proforma_items.reduce((s, i) => s + i.cantidad, 0)
    const totalAsignado = equiposAsignadosPorProforma.get(p.id) ?? 0
    return totalAsignado < totalPedido
  })
  const proformasCompletas = proformasConfirmadas.filter(p => {
    const totalPedido = p.proforma_items.reduce((s, i) => s + i.cantidad, 0)
    const totalAsignado = equiposAsignadosPorProforma.get(p.id) ?? 0
    return totalAsignado >= totalPedido
  })

  return (
    <div className="space-y-6">
      {/* Proformas confirmadas pendientes de asignar equipos */}
      {proformasPendientes.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Proformas confirmadas — pendientes de asignar equipos</h3>
          <div className="space-y-3">
            {proformasPendientes.map(p => {
              const totalPedido = p.proforma_items.reduce((s, i) => s + i.cantidad, 0)
              const totalAsignado = equiposAsignadosPorProforma.get(p.id) ?? 0
              const pendientes = totalPedido - totalAsignado

              return (
              <div key={p.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-5 py-4 flex items-center justify-between">
                  <div>
                    <span className="font-semibold text-gray-900">{p.cliente_nombre || p.nombre}</span>
                    {p.cliente_nombre && <span className="text-xs text-gray-500 ml-2">({p.nombre})</span>}
                    <div className="text-xs text-gray-500 mt-0.5">
                      {totalPedido} equipos · {formatearMoneda(p.total_con_iva)}
                      {totalAsignado > 0 && (
                        <span className="ml-2 text-amber-600 font-medium">
                          ({totalAsignado} asignados, faltan {pendientes})
                        </span>
                      )}
                    </div>
                    {/* Detalle modelos */}
                    <div className="flex flex-wrap gap-1 mt-1">
                      {p.proforma_items.map((item, i) => (
                        <span key={i} className="text-[10px] bg-gray-100 px-2 py-0.5 rounded text-gray-600">
                          {item.producto_nombre} ×{item.cantidad}
                        </span>
                      ))}
                    </div>
                  </div>
                  <button
                    onClick={() => setAsignandoProformaId(asignandoProformaId === p.id ? null : p.id)}
                    className="px-4 py-2 bg-magenta-600 text-white text-sm font-medium rounded-lg hover:bg-magenta-700 transition-colors shrink-0"
                  >
                    {asignandoProformaId === p.id ? 'Cancelar' : `Asignar equipos (${pendientes})`}
                  </button>
                </div>

                {asignandoProformaId === p.id && (
                  <div className="border-t border-gray-200">
                    <AsignarMayoristaForm
                      proforma={p}
                      dispositivos={dispositivos}
                      onDone={() => { setAsignandoProformaId(null); router.refresh() }}
                    />
                  </div>
                )}
              </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Asignaciones mayoristas existentes (solo de proformas completas) */}
      {(proformasCompletas.length > 0 || borradores.length > 0 || confirmados.length > 0) && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Asignaciones mayoristas realizadas</h3>
          <div className="space-y-3">
            {[...borradores, ...confirmados].map(a => {
              const proforma = proformasConfirmadas.find(p => p.id === a.proforma_id)
              const models = groupByModel(a.asignacion_items)
              return (
                <div key={a.id} className="bg-white rounded-xl border border-gray-200 p-5">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <span className="font-semibold text-gray-900">
                        {proforma?.cliente_nombre || proforma?.nombre || 'Venta Mayorista'}
                      </span>
                      <span className="text-xs text-gray-500 ml-3">{a.fecha}</span>
                    </div>
                    <span className={`px-2.5 py-1 text-xs font-semibold rounded-full ${
                      a.firma_url ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                    }`}>
                      {a.firma_url ? 'Confirmado' : 'Borrador'}
                    </span>
                  </div>
                  <div className="text-sm text-gray-600">
                    {a.total_unidades} equipos · {formatearMoneda(a.total_valor_costo)}
                  </div>
                  {models.map(g => (
                    <div key={`${g.marca}-${g.modelo}`} className="text-xs text-gray-500 mt-1">
                      {g.marca} {g.modelo} ×{g.imeis.length}
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {proformasPendientes.length === 0 && borradores.length === 0 && confirmados.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-gray-400 text-sm">
            No hay proformas confirmadas. Creá y confirmá una proforma en la pestaña Proformas.
          </p>
        </div>
      )}
    </div>
  )
}

// =====================================================================
// Formulario de asignación para una proforma
// =====================================================================

function AsignarMayoristaForm({
  proforma, dispositivos, onDone,
}: {
  proforma: ProformaConItems
  dispositivos: DispositivoConModelo[]
  onDone: () => void
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [imeiInput, setImeiInput] = useState('')
  const [imeiFeedback, setImeiFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const imeiInputRef = useRef<HTMLInputElement>(null)
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (imeiFeedback) {
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current)
      feedbackTimerRef.current = setTimeout(() => setImeiFeedback(null), 2000)
    }
    return () => { if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current) }
  }, [imeiFeedback])

  const imeiMap = useMemo(() => {
    const map = new Map<string, DispositivoConModelo>()
    for (const d of dispositivos) map.set(d.imei, d)
    return map
  }, [dispositivos])

  const handleImeiSubmit = useCallback(() => {
    const trimmed = imeiInput.trim()
    if (!trimmed) return
    const device = imeiMap.get(trimmed)
    if (device) {
      if (selected.has(device.id)) {
        setImeiFeedback({ type: 'success', message: 'IMEI ya seleccionado' })
      } else {
        setSelected(prev => { const next = new Set(prev); next.add(device.id); return next })
        setImeiFeedback({ type: 'success', message: 'IMEI agregado' })
      }
      setImeiInput('')
    } else {
      setImeiFeedback({ type: 'error', message: 'IMEI no encontrado en stock' })
    }
    imeiInputRef.current?.focus()
  }, [imeiInput, imeiMap, selected])

  const selectedDispositivos = useMemo(
    () => dispositivos.filter(d => selected.has(d.id)),
    [dispositivos, selected]
  )

  const totalValorCosto = selectedDispositivos.reduce((acc, d) => acc + d.modelos.precio_costo, 0)

  // Resumen por modelo de lo seleccionado vs lo pedido en la proforma
  const resumenModelos = useMemo(() => {
    const pedido: Record<string, { nombre: string; cantidad: number }> = {}
    for (const item of proforma.proforma_items) {
      pedido[item.producto_nombre] = { nombre: item.producto_nombre, cantidad: item.cantidad }
    }

    const asignado: Record<string, number> = {}
    for (const d of selectedDispositivos) {
      const key = `${d.modelos.marca} ${d.modelos.modelo}`
      asignado[key] = (asignado[key] || 0) + 1
    }

    return { pedido, asignado }
  }, [proforma, selectedDispositivos])

  async function handleAsignar() {
    if (selected.size === 0) return
    setSubmitting(true)
    setError(null)

    const result = await prepararAsignacionMayorista({
      proforma_id: proforma.id,
      dispositivos: selectedDispositivos.map(d => ({
        imei: d.imei,
        modelo_id: d.modelo_id,
        marca: d.modelos.marca,
        modelo: d.modelos.modelo,
        precio_costo: d.modelos.precio_costo,
      })),
      total_valor_costo: totalValorCosto,
      total_valor_venta: totalValorCosto,
    })

    setSubmitting(false)
    if ('error' in result) {
      setError(result.error)
    } else {
      onDone()
    }
  }

  return (
    <div className="p-5 space-y-4">
      {/* Detalle de lo que pide la proforma */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
        <p className="text-xs font-semibold text-blue-700 mb-1">Equipos solicitados en la proforma:</p>
        <div className="flex flex-wrap gap-2">
          {proforma.proforma_items.map((item, i) => {
            const asignados = Object.entries(resumenModelos.asignado).find(([k]) =>
              item.producto_nombre.toLowerCase().includes(k.toLowerCase()) || k.toLowerCase().includes(item.producto_nombre.toLowerCase())
            )
            const cantAsignada = asignados ? asignados[1] : 0
            const completo = cantAsignada >= item.cantidad
            return (
              <span key={i} className={`text-xs px-2 py-1 rounded font-medium ${
                completo ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
              }`}>
                {item.producto_nombre}: {cantAsignada}/{item.cantidad}
              </span>
            )
          })}
        </div>
      </div>

      {/* IMEI input */}
      <div className="flex gap-2">
        <input
          ref={imeiInputRef}
          type="text"
          value={imeiInput}
          onChange={e => setImeiInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleImeiSubmit() } }}
          placeholder="Escanear o escribir IMEI..."
          className="flex-1 min-w-0 px-3 py-2.5 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-magenta-500"
          autoComplete="off"
          inputMode="numeric"
        />
        <button type="button" onClick={handleImeiSubmit} className="px-4 py-2.5 bg-magenta-600 text-white font-medium rounded-lg hover:bg-magenta-700 shrink-0">
          +
        </button>
      </div>

      {imeiFeedback && (
        <div className={`px-4 py-2 rounded-lg text-sm font-medium ${
          imeiFeedback.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {imeiFeedback.message}
        </div>
      )}

      {/* Equipos seleccionados */}
      {selected.size > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-100">
          {selectedDispositivos.map(d => (
            <div key={d.id} className="flex items-center justify-between px-4 py-2">
              <div>
                <span className="font-mono text-xs text-gray-700">{d.imei}</span>
                <span className="text-xs text-gray-500 ml-2">{d.modelos.marca} {d.modelos.modelo}</span>
              </div>
              <button
                onClick={() => setSelected(prev => { const next = new Set(prev); next.delete(d.id); return next })}
                className="text-xs text-red-400 hover:text-red-600"
              >
                Quitar
              </button>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-sm text-red-700">{error}</div>
      )}

      {/* Submit */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-500">{selected.size} equipos seleccionados</span>
        <button
          onClick={handleAsignar}
          disabled={submitting || selected.size === 0}
          className="px-5 py-2 bg-magenta-600 text-white text-sm font-medium rounded-lg hover:bg-magenta-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {submitting ? 'Asignando...' : `Asignar ${selected.size} equipos`}
        </button>
      </div>
    </div>
  )
}
