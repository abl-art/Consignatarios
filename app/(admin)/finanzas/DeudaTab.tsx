'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatearMoneda } from '@/lib/utils'
import { setDeudaConfig } from '@/lib/actions/deuda'
import type { DeudaPrestamo, DeudaMovimiento, DeudaConfig } from '@/lib/types'

interface DeudaTabProps {
  prestamos: DeudaPrestamo[]
  movimientos: DeudaMovimiento[]
  config: DeudaConfig
  interesesMes: number
}

export default function DeudaTab({ prestamos, movimientos, config, interesesMes }: DeudaTabProps) {
  const router = useRouter()
  const [showConfig, setShowConfig] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Config form state
  const [tasaBullet, setTasaBullet] = useState(String(config.tasa_bullet * 100))
  const [tasaDescubierto, setTasaDescubierto] = useState(String(config.tasa_descubierto * 100))
  const [limite, setLimite] = useState(String(config.limite))
  const [saldoMinimo, setSaldoMinimo] = useState(String(config.saldo_minimo))

  const activos = prestamos.filter(p => p.estado === 'activo')
  const deudaVigente = activos.reduce((sum, p) => sum + p.saldo_capital, 0)
  const disponible = config.limite - deudaVigente
  const usoPct = config.limite > 0 ? (deudaVigente / config.limite) * 100 : 0
  const barColor = usoPct < 50 ? 'bg-green-500' : usoPct < 80 ? 'bg-yellow-500' : 'bg-red-500'

  async function handleSaveConfig() {
    setSaving(true)
    await setDeudaConfig({
      tasa_bullet: Number(tasaBullet) / 100,
      tasa_descubierto: Number(tasaDescubierto) / 100,
      limite: Number(limite),
      saldo_minimo: Number(saldoMinimo),
    })
    setSaving(false)
    router.refresh()
  }

  return (
    <div className="space-y-6">
      {/* Cards resumen */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs text-gray-500 mb-1">Línea total</p>
          <p className="text-xl font-bold text-gray-900">{formatearMoneda(config.limite)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs text-gray-500 mb-1">Deuda vigente</p>
          <p className="text-xl font-bold text-red-600">{formatearMoneda(deudaVigente)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs text-gray-500 mb-1">Disponible</p>
          <p className="text-xl font-bold text-green-600">{formatearMoneda(disponible)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs text-gray-500 mb-1">Intereses pagados (mes)</p>
          <p className="text-xl font-bold text-gray-900">{formatearMoneda(interesesMes)}</p>
        </div>
      </div>

      {/* Barra de uso */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-gray-600">Uso de línea</span>
          <span className="text-sm font-semibold text-gray-900">{Math.round(usoPct)}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-3">
          <div className={`${barColor} rounded-full h-3 transition-all`} style={{ width: `${Math.min(100, usoPct)}%` }} />
        </div>
        <div className="flex justify-between mt-1 text-xs text-gray-400">
          <span>$0</span>
          <span>{formatearMoneda(config.limite)}</span>
        </div>
      </div>

      {/* Tabla de préstamos */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-200 bg-gray-50">
          <h3 className="font-semibold text-gray-900">Préstamos</h3>
        </div>
        {prestamos.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">No hay préstamos registrados</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-600">Tipo</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Capital</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Tasa TNA</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Fecha toma</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Vencimiento</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Saldo</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Estado</th>
              </tr>
            </thead>
            <tbody>
              {prestamos.map((p) => (
                <>
                  <tr
                    key={p.id}
                    onClick={() => setExpandedId(prev => prev === p.id ? null : p.id)}
                    className={`border-b border-gray-100 cursor-pointer transition-colors ${p.estado === 'cancelado' ? 'bg-gray-50 opacity-60' : 'hover:bg-gray-50'}`}
                  >
                    <td className="px-4 py-3">
                      <span className="mr-1 text-gray-400">{expandedId === p.id ? '▾' : '▸'}</span>
                      <span className={`px-2 py-0.5 text-xs rounded-full ${p.tipo === 'bullet' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}`}>
                        {p.tipo === 'bullet' ? 'Bullet' : 'Descubierto'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-medium">{formatearMoneda(p.monto_capital)}</td>
                    <td className="px-4 py-3 text-center">{(p.tasa_anual * 100).toFixed(1)}%</td>
                    <td className="px-4 py-3 text-gray-600">{new Date(p.fecha_toma).toLocaleDateString('es-AR')}</td>
                    <td className="px-4 py-3 text-gray-600">{p.fecha_vencimiento ? new Date(p.fecha_vencimiento).toLocaleDateString('es-AR') : '—'}</td>
                    <td className="px-4 py-3 text-right font-medium text-red-600">{formatearMoneda(p.saldo_capital)}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2.5 py-1 text-xs font-semibold rounded-full ${p.estado === 'activo' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {p.estado}
                      </span>
                    </td>
                  </tr>
                  {expandedId === p.id && (
                    <tr key={`${p.id}-detail`}>
                      <td colSpan={7} className="px-6 py-4 bg-gray-50 border-b border-gray-200">
                        <p className="text-xs font-semibold text-gray-500 mb-2">Movimientos</p>
                        {(() => {
                          const movs = movimientos.filter(m => m.prestamo_id === p.id)
                          if (movs.length === 0) return <p className="text-xs text-gray-400">Sin movimientos</p>
                          return (
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="border-b border-gray-200">
                                  <th className="text-left py-1.5 font-medium text-gray-500">Fecha</th>
                                  <th className="text-left py-1.5 font-medium text-gray-500">Tipo</th>
                                  <th className="text-right py-1.5 font-medium text-gray-500">Monto</th>
                                </tr>
                              </thead>
                              <tbody>
                                {movs.map((m) => (
                                  <tr key={m.id} className="border-b border-gray-100">
                                    <td className="py-1.5 text-gray-600">{new Date(m.fecha).toLocaleDateString('es-AR')}</td>
                                    <td className="py-1.5">
                                      <span className={`px-1.5 py-0.5 text-xs rounded ${m.tipo === 'toma' ? 'bg-blue-50 text-blue-600' : m.tipo === 'devolucion' ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>
                                        {m.tipo}
                                      </span>
                                    </td>
                                    <td className="py-1.5 text-right font-medium">{formatearMoneda(m.monto)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )
                        })()}
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Configuración colapsable */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <button
          onClick={() => setShowConfig(!showConfig)}
          className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-50 transition-colors"
        >
          <h3 className="font-semibold text-gray-900">Configuración de deuda</h3>
          <svg className={`w-5 h-5 text-gray-400 transition-transform ${showConfig ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {showConfig && (
          <div className="border-t border-gray-200 p-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Tasa Bullet (TNA %)</label>
                <input
                  type="number"
                  step="0.1"
                  value={tasaBullet}
                  onChange={(e) => setTasaBullet(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Tasa Descubierto (TNA %)</label>
                <input
                  type="number"
                  step="0.1"
                  value={tasaDescubierto}
                  onChange={(e) => setTasaDescubierto(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Límite de línea ($)</label>
                <input
                  type="number"
                  value={limite}
                  onChange={(e) => setLimite(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Saldo mínimo flujo ($)</label>
                <input
                  type="number"
                  value={saldoMinimo}
                  onChange={(e) => setSaldoMinimo(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
            </div>
            <div className="mt-4 text-right">
              <button
                onClick={handleSaveConfig}
                disabled={saving}
                className="px-5 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {saving ? 'Guardando...' : 'Guardar configuración'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
