'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { formatearMoneda } from '@/lib/utils'
import { generarPlanilla, guardarConteo, firmarAuditoria, type AuditoriaStockPropio, type DetalleModelo } from '@/lib/actions/auditoria-stock'
import FirmaCanvas from '@/components/FirmaCanvas'

interface Props {
  auditorias: AuditoriaStockPropio[]
}

export default function AuditoriaStockClient({ auditorias }: Props) {
  const router = useRouter()
  const [generando, setGenerando] = useState(false)
  const [mesGenerar, setMesGenerar] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  const [editando, setEditando] = useState<string | null>(null)
  const [firmando, setFirmando] = useState<string | null>(null)
  const [error, setError] = useState('')

  async function handleGenerar() {
    setGenerando(true)
    setError('')
    const res = await generarPlanilla(mesGenerar)
    if ('error' in res) setError(res.error)
    setGenerando(false)
    router.refresh()
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Auditoría de Stock Propio</h1>
      <p className="text-sm text-gray-500 mb-6">Conteo físico mensual para existencia final y control de inventario</p>

      {/* Generar planilla */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <h3 className="font-semibold text-gray-900 mb-3">Generar planilla de conteo</h3>
        <div className="flex gap-3 items-end">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Mes de corte</label>
            <input type="month" value={mesGenerar} onChange={e => setMesGenerar(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm" />
          </div>
          <button onClick={handleGenerar} disabled={generando}
            className="px-5 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {generando ? 'Generando...' : 'Generar planilla'}
          </button>
        </div>
        {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
        <p className="text-xs text-gray-400 mt-2">Se genera con el stock del último día del mes seleccionado, neto de pendientes de asignar.</p>
      </div>

      {/* Historial de auditorías */}
      {auditorias.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400 text-sm">
          Sin auditorías. Generá una planilla para empezar.
        </div>
      ) : (
        <div className="space-y-4">
          {auditorias.map(a => (
            <div key={a.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              {/* Header */}
              <div className="px-5 py-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-gray-900">
                    Corte: {new Date(a.fecha_corte + 'T12:00').toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })}
                  </h3>
                  <p className="text-xs text-gray-500">
                    Fecha corte: {new Date(a.fecha_corte + 'T12:00').toLocaleDateString('es-AR')}
                    {a.fecha_conteo && ` · Conteo: ${new Date(a.fecha_conteo + 'T12:00').toLocaleDateString('es-AR')}`}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`px-3 py-1 text-xs font-semibold rounded-full ${
                    a.estado === 'firmada' ? 'bg-green-100 text-green-700' :
                    a.estado === 'en_conteo' ? 'bg-yellow-100 text-yellow-700' :
                    'bg-blue-100 text-blue-700'
                  }`}>
                    {a.estado === 'firmada' ? 'Firmada' : a.estado === 'en_conteo' ? 'En conteo' : 'Pendiente'}
                  </span>
                  {a.estado === 'pendiente' && (
                    <button onClick={() => setEditando(editando === a.id ? null : a.id)}
                      className="px-3 py-1 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                      Iniciar conteo
                    </button>
                  )}
                  {a.estado === 'en_conteo' && (
                    <>
                      <button onClick={() => setEditando(editando === a.id ? null : a.id)}
                        className="px-3 py-1 text-xs bg-yellow-600 text-white rounded-lg hover:bg-yellow-700">
                        Editar conteo
                      </button>
                      <button onClick={() => setFirmando(a.id)}
                        className="px-3 py-1 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700">
                        Firmar
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Resumen cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4">
                <div className="text-center">
                  <p className="text-xs text-gray-500">Valor teórico</p>
                  <p className="text-lg font-bold text-gray-900">{formatearMoneda(a.total_teorico)}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-gray-500">Valor real</p>
                  <p className="text-lg font-bold text-blue-700">{a.total_real > 0 ? formatearMoneda(a.total_real) : '—'}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-gray-500">Diferencia</p>
                  <p className={`text-lg font-bold ${a.total_diferencia >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                    {a.total_real > 0 ? formatearMoneda(a.total_diferencia) : '—'}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-gray-500">Existencia final</p>
                  <p className="text-lg font-bold text-magenta-700">{a.valor_existencia_final > 0 ? formatearMoneda(a.valor_existencia_final) : '—'}</p>
                </div>
              </div>

              {/* Tabla de conteo editable */}
              {(editando === a.id || a.estado !== 'pendiente') && (
                <ConteoTable auditoria={a} editable={editando === a.id} onSaved={() => { setEditando(null); router.refresh() }} />
              )}

              {/* Firmas */}
              {a.estado === 'firmada' && (
                <div className="px-5 py-3 border-t border-gray-200 bg-green-50 flex gap-8">
                  <div className="text-center">
                    <p className="text-xs text-gray-500 mb-1">Responsable</p>
                    <p className="text-sm font-semibold text-gray-900">{a.firma_responsable}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-gray-500 mb-1">Supervisor</p>
                    <p className="text-sm font-semibold text-gray-900">{a.firma_supervisor}</p>
                  </div>
                </div>
              )}

              {/* Modal de firma */}
              {firmando === a.id && (
                <FirmarModal auditoriaId={a.id} onClose={() => { setFirmando(null); router.refresh() }} />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Tabla de conteo ────────────────────────────────────────────────────────

function ConteoTable({ auditoria, editable, onSaved }: { auditoria: AuditoriaStockPropio; editable: boolean; onSaved: () => void }) {
  const [detalle, setDetalle] = useState<DetalleModelo[]>(auditoria.detalle)
  const [observaciones, setObservaciones] = useState(auditoria.observaciones || '')
  const [guardando, setGuardando] = useState(false)

  function updateReal(idx: number, real: number) {
    setDetalle(prev => prev.map((d, i) => {
      if (i !== idx) return d
      const diferencia = real - d.teorico
      return {
        ...d,
        real,
        diferencia,
        valor_real: real * d.precio_unit,
        valor_diferencia: diferencia * d.precio_unit,
      }
    }))
  }

  async function handleGuardar() {
    setGuardando(true)
    await guardarConteo(auditoria.id, detalle, observaciones)
    setGuardando(false)
    onSaved()
  }

  const totalUnidadesTeorico = detalle.reduce((s, d) => s + d.teorico, 0)
  const totalUnidadesReal = detalle.reduce((s, d) => s + d.real, 0)
  const totalValorReal = detalle.reduce((s, d) => s + d.valor_real, 0)
  const totalValorDif = detalle.reduce((s, d) => s + d.valor_diferencia, 0)

  return (
    <div className="border-t border-gray-200">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-2 font-medium text-gray-600">Modelo</th>
              <th className="text-right px-3 py-2 font-medium text-gray-600">Disp.</th>
              <th className="text-right px-3 py-2 font-medium text-gray-600">Pend.</th>
              <th className="text-right px-3 py-2 font-medium text-gray-600">Teórico</th>
              <th className="text-right px-3 py-2 font-medium text-gray-600">Real</th>
              <th className="text-right px-3 py-2 font-medium text-gray-600">Dif.</th>
              <th className="text-right px-3 py-2 font-medium text-gray-600">Precio unit.</th>
              <th className="text-right px-3 py-2 font-medium text-gray-600">Valor real</th>
              <th className="text-right px-3 py-2 font-medium text-gray-600">Valor dif.</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {detalle.map((d, i) => (
              <tr key={d.modelo} className={d.diferencia < 0 ? 'bg-red-50' : d.diferencia > 0 ? 'bg-yellow-50' : ''}>
                <td className="px-4 py-2 text-gray-900 font-medium text-xs">{d.modelo}</td>
                <td className="px-3 py-2 text-right text-gray-600">{d.disponibles}</td>
                <td className="px-3 py-2 text-right text-gray-500">{d.pendientes}</td>
                <td className="px-3 py-2 text-right font-semibold">{d.teorico}</td>
                <td className="px-3 py-2 text-right">
                  {editable ? (
                    <input type="number" min="0" value={d.real || ''} onChange={e => updateReal(i, Number(e.target.value) || 0)}
                      className="w-16 px-2 py-1 border border-gray-300 rounded text-sm text-center" />
                  ) : (
                    <span className="font-semibold">{d.real}</span>
                  )}
                </td>
                <td className={`px-3 py-2 text-right font-bold ${d.diferencia < 0 ? 'text-red-700' : d.diferencia > 0 ? 'text-yellow-700' : 'text-green-700'}`}>
                  {d.real > 0 ? (d.diferencia > 0 ? '+' : '') + d.diferencia : '—'}
                </td>
                <td className="px-3 py-2 text-right text-gray-500 text-xs">{d.precio_unit > 0 ? formatearMoneda(d.precio_unit) : '—'}</td>
                <td className="px-3 py-2 text-right text-blue-700">{d.valor_real > 0 ? formatearMoneda(d.valor_real) : '—'}</td>
                <td className={`px-3 py-2 text-right ${d.valor_diferencia < 0 ? 'text-red-700' : d.valor_diferencia > 0 ? 'text-yellow-700' : ''}`}>
                  {d.real > 0 ? formatearMoneda(d.valor_diferencia) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-gray-300 bg-gray-50">
            <tr className="font-bold">
              <td className="px-4 py-2">TOTAL</td>
              <td className="px-3 py-2 text-right">{detalle.reduce((s, d) => s + d.disponibles, 0)}</td>
              <td className="px-3 py-2 text-right">{detalle.reduce((s, d) => s + d.pendientes, 0)}</td>
              <td className="px-3 py-2 text-right">{totalUnidadesTeorico}</td>
              <td className="px-3 py-2 text-right">{totalUnidadesReal || '—'}</td>
              <td className={`px-3 py-2 text-right ${(totalUnidadesReal - totalUnidadesTeorico) < 0 ? 'text-red-700' : 'text-green-700'}`}>
                {totalUnidadesReal > 0 ? totalUnidadesReal - totalUnidadesTeorico : '—'}
              </td>
              <td className="px-3 py-2"></td>
              <td className="px-3 py-2 text-right text-blue-700">{totalValorReal > 0 ? formatearMoneda(totalValorReal) : '—'}</td>
              <td className={`px-3 py-2 text-right ${totalValorDif < 0 ? 'text-red-700' : 'text-yellow-700'}`}>
                {totalValorReal > 0 ? formatearMoneda(totalValorDif) : '—'}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {editable && (
        <div className="p-4 border-t border-gray-200">
          <textarea value={observaciones} onChange={e => setObservaciones(e.target.value)} placeholder="Observaciones..."
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-3" rows={2} />
          <button onClick={handleGuardar} disabled={guardando}
            className="px-5 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {guardando ? 'Guardando...' : 'Guardar conteo'}
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Modal de firma ─────────────────────────────────────────────────────────

function FirmarModal({ auditoriaId, onClose }: { auditoriaId: string; onClose: () => void }) {
  const [nombreResp, setNombreResp] = useState('')
  const [nombreSup, setNombreSup] = useState('')
  const [firmaResp, setFirmaResp] = useState('')
  const [firmaSup, setFirmaSup] = useState('')
  const [paso, setPaso] = useState<'responsable' | 'supervisor'>('responsable')
  const [guardando, setGuardando] = useState(false)

  async function handleFirmar() {
    if (!nombreResp || !firmaResp || !nombreSup || !firmaSup) return
    setGuardando(true)
    await firmarAuditoria(auditoriaId, nombreResp, firmaResp, nombreSup, firmaSup)
    setGuardando(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl border border-gray-200 p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Firma {paso === 'responsable' ? 'del Responsable' : 'del Supervisor'}
        </h3>

        {paso === 'responsable' && (
          <>
            <input type="text" value={nombreResp} onChange={e => setNombreResp(e.target.value)} placeholder="Nombre del responsable"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-3" />
            <div className="border border-gray-300 rounded-lg overflow-hidden mb-3">
              <FirmaCanvas onSave={setFirmaResp} />
            </div>
            <button onClick={() => { if (nombreResp && firmaResp) setPaso('supervisor') }} disabled={!nombreResp || !firmaResp}
              className="w-full px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50">
              Siguiente → Firma supervisor
            </button>
          </>
        )}

        {paso === 'supervisor' && (
          <>
            <input type="text" value={nombreSup} onChange={e => setNombreSup(e.target.value)} placeholder="Nombre del supervisor"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-3" />
            <div className="border border-gray-300 rounded-lg overflow-hidden mb-3">
              <FirmaCanvas onSave={setFirmaSup} />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setPaso('responsable')} className="flex-1 px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg">
                ← Volver
              </button>
              <button onClick={handleFirmar} disabled={guardando || !nombreSup || !firmaSup}
                className="flex-1 px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700 disabled:opacity-50">
                {guardando ? 'Firmando...' : 'Firmar y cerrar'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
