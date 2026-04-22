'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { formatearMoneda } from '@/lib/utils'
import { guardarProducto, eliminarProducto } from '@/lib/actions/productos'
import type { ProductoFinanciero } from '@/lib/actions/productos'
import {
  simularDeterministico, simularEstocastico, generarNombreProducto,
  type SimuladorParams, type SplitConfig, type ResultadoSimulacion, type Indicadores,
} from '@/lib/simulador'

interface Props {
  productos: ProductoFinanciero[]
}

const defaultParams: SimuladorParams = {
  order_amount: 150000,
  down_payment_pct: 0,
  cuotas: 6,
  operaciones_por_mes: [1],
  tasa_descuento_comercio: 15,
  splits: [{ plazo_dias: 30, porcentaje: 100 }],
  costo_financiacion_tna: 45,
  costos_operativos_pct: 2,
  imp_creditos_pct: 0.6,
  imp_debitos_pct: 0.6,
  iibb_pct: 4,
  incobrabilidad_media: 3,
  incobrabilidad_desvio: 1.5,
  mora_media_dias: 15,
  mora_desvio_dias: 7,
  modalidad: 'terceros' as const,
  flete: 0,
  comision_consignatario_pct: 10,
}

const fmtPct = (v: number) => (v * 100).toFixed(2) + '%'
const fmtK = (v: number) => {
  if (v === 0) return ''
  const abs = Math.abs(v)
  const sign = v < 0 ? '-' : ''
  if (abs >= 1_000_000) return sign + (abs / 1_000_000).toFixed(1) + 'M'
  if (abs >= 1_000) return sign + Math.round(abs / 1_000) + 'K'
  return sign + Math.round(abs).toString()
}

export default function SimuladorTab({ productos }: Props) {
  const router = useRouter()
  const [params, setParams] = useState<SimuladorParams>(defaultParams)
  const [modo, setModo] = useState<'det' | 'est'>('det')
  const [saving, setSaving] = useState(false)
  const [showProductos, setShowProductos] = useState(false)
  const [opsStr, setOpsStr] = useState('1')

  function updateParam<K extends keyof SimuladorParams>(key: K, value: SimuladorParams[K]) {
    setParams(prev => ({ ...prev, [key]: value }))
  }

  function updateSplit(idx: number, field: keyof SplitConfig, value: number) {
    setParams(prev => {
      const splits = [...prev.splits]
      splits[idx] = { ...splits[idx], [field]: value }
      return { ...prev, splits }
    })
  }

  function setSplitCount(n: number) {
    setParams(prev => {
      const splits: SplitConfig[] = []
      const pct = Math.floor(100 / n)
      for (let i = 0; i < n; i++) {
        splits.push({
          plazo_dias: prev.splits[i]?.plazo_dias ?? 30 * (i + 1),
          porcentaje: i === n - 1 ? 100 - pct * (n - 1) : pct,
        })
      }
      return { ...prev, splits }
    })
  }

  function handleOpsChange(value: string) {
    setOpsStr(value)
    const nums = value.split(',').map(s => Number(s.trim()) || 0)
    updateParam('operaciones_por_mes', nums)
  }

  // Resultado
  const resultado = useMemo(() => {
    if (modo === 'det') {
      return { tipo: 'det' as const, det: simularDeterministico(params) }
    } else {
      const est = simularEstocastico(params)
      return { tipo: 'est' as const, det: est.mediana, est }
    }
  }, [params, modo])

  const sim = resultado.det
  const ind = sim.indicadores

  async function handleGuardar() {
    setSaving(true)
    const nombre = generarNombreProducto(params)
    await guardarProducto(nombre, params as unknown as Record<string, unknown>, ind as unknown as Record<string, unknown>)
    setSaving(false)
    router.refresh()
  }

  function cargarProducto(p: ProductoFinanciero) {
    const loaded = p.parametros as unknown as SimuladorParams
    setParams(loaded)
    setOpsStr(loaded.operaciones_por_mes.join(', '))
  }

  return (
    <div className="space-y-6">
      {/* Parámetros + Indicadores */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Parámetros */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900">Parámetros</h3>
            <div className="flex gap-2">
              <button
                onClick={() => setModo('det')}
                className={`px-3 py-1 text-xs font-medium rounded-full ${modo === 'det' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}
              >
                Determinístico
              </button>
              <button
                onClick={() => setModo('est')}
                className={`px-3 py-1 text-xs font-medium rounded-full ${modo === 'est' ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-600'}`}
              >
                Estocástico
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            {/* Operación */}
            <div>
              <label className="block text-gray-500 mb-1">Order amount ($)</label>
              <input type="number" value={params.order_amount} onChange={e => updateParam('order_amount', Number(e.target.value))} className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs" />
            </div>
            <div>
              <label className="block text-gray-500 mb-1">Down payment (%)</label>
              <input type="number" step="0.1" value={params.down_payment_pct} onChange={e => updateParam('down_payment_pct', Number(e.target.value))} className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs" />
            </div>
            <div>
              <label className="block text-gray-500 mb-1">Cuotas</label>
              <input type="number" min="1" max="24" value={params.cuotas} onChange={e => updateParam('cuotas', Number(e.target.value))} className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs" />
            </div>
            <div>
              <label className="block text-gray-500 mb-1">Tasa descuento (%)</label>
              <input type="number" step="0.1" value={params.tasa_descuento_comercio} onChange={e => updateParam('tasa_descuento_comercio', Number(e.target.value))} className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs" />
            </div>
            <div className="col-span-2">
              <label className="block text-gray-500 mb-1">Ops/mes (separar con coma)</label>
              <input type="text" value={opsStr} onChange={e => handleOpsChange(e.target.value)} placeholder="500, 500, 500" className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs" />
            </div>
            <div>
              <label className="block text-gray-500 mb-1">Costo financ. TNA (%)</label>
              <input type="number" step="0.1" value={params.costo_financiacion_tna} onChange={e => updateParam('costo_financiacion_tna', Number(e.target.value))} className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs" />
            </div>
            <div>
              <label className="block text-gray-500 mb-1">Costos op. (%)</label>
              <input type="number" step="0.1" value={params.costos_operativos_pct} onChange={e => updateParam('costos_operativos_pct', Number(e.target.value))} className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs" />
            </div>
            <div>
              <label className="block text-gray-500 mb-1">Imp. créditos (%)</label>
              <input type="number" step="0.01" value={params.imp_creditos_pct} onChange={e => updateParam('imp_creditos_pct', Number(e.target.value))} className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs" />
            </div>
            <div>
              <label className="block text-gray-500 mb-1">Imp. débitos (%)</label>
              <input type="number" step="0.01" value={params.imp_debitos_pct} onChange={e => updateParam('imp_debitos_pct', Number(e.target.value))} className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs" />
            </div>
            <div>
              <label className="block text-gray-500 mb-1">IIBB (%)</label>
              <input type="number" step="0.1" value={params.iibb_pct} onChange={e => updateParam('iibb_pct', Number(e.target.value))} className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs" />
            </div>
            <div>
              <label className="block text-gray-500 mb-1">Incob. media (%)</label>
              <input type="number" step="0.1" value={params.incobrabilidad_media} onChange={e => updateParam('incobrabilidad_media', Number(e.target.value))} className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs" />
            </div>
            <div className="flex items-center gap-4 col-span-2">
              {(['terceros', 'propia', 'consignatarios'] as const).map(m => (
                <label key={m} className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
                  <input type="radio" name="modalidad" checked={params.modalidad === m} onChange={() => updateParam('modalidad', m)} className="w-3.5 h-3.5 accent-blue-600" />
                  {m === 'terceros' ? 'Vta de Terceros' : m === 'propia' ? 'Venta Propia' : 'Consignatarios'}
                </label>
              ))}
            </div>
            {params.modalidad === 'propia' && (
              <div>
                <label className="block text-gray-500 mb-1">Flete ($)</label>
                <input type="number" value={params.flete} onChange={e => updateParam('flete', Number(e.target.value))} className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs" />
              </div>
            )}
            {params.modalidad === 'consignatarios' && (
              <div>
                <label className="block text-gray-500 mb-1">Comisión consig. (%)</label>
                <input type="number" step="0.1" value={params.comision_consignatario_pct} onChange={e => updateParam('comision_consignatario_pct', Number(e.target.value))} className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs" />
              </div>
            )}
            {modo === 'est' && (
              <>
                <div>
                  <label className="block text-gray-500 mb-1">Incob. desvío (%)</label>
                  <input type="number" step="0.1" value={params.incobrabilidad_desvio} onChange={e => updateParam('incobrabilidad_desvio', Number(e.target.value))} className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs" />
                </div>
                <div>
                  <label className="block text-gray-500 mb-1">Mora media (días)</label>
                  <input type="number" value={params.mora_media_dias} onChange={e => updateParam('mora_media_dias', Number(e.target.value))} className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs" />
                </div>
                <div>
                  <label className="block text-gray-500 mb-1">Mora desvío (días)</label>
                  <input type="number" value={params.mora_desvio_dias} onChange={e => updateParam('mora_desvio_dias', Number(e.target.value))} className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs" />
                </div>
              </>
            )}
          </div>

          {/* Splits */}
          <div className="mt-4 pt-4 border-t border-gray-200">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-xs font-medium text-gray-600">Splits de liquidación:</span>
              <input type="number" min="1" max="12" value={params.splits.length} onChange={e => setSplitCount(Number(e.target.value) || 1)} className="w-14 px-2 py-1 border border-gray-300 rounded text-xs" />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {params.splits.map((s, i) => (
                <div key={i} className="flex gap-1 items-center">
                  <span className="text-[10px] text-gray-400 w-4">{i + 1}.</span>
                  <input type="number" value={s.plazo_dias} onChange={e => updateSplit(i, 'plazo_dias', Number(e.target.value))} className="w-14 px-1 py-1 border border-gray-300 rounded text-[10px]" title="Plazo días" />
                  <span className="text-[10px] text-gray-400">d</span>
                  <input type="number" value={s.porcentaje} onChange={e => updateSplit(i, 'porcentaje', Number(e.target.value))} className="w-12 px-1 py-1 border border-gray-300 rounded text-[10px]" title="%" />
                  <span className="text-[10px] text-gray-400">%</span>
                </div>
              ))}
            </div>
            {params.splits.reduce((s, sp) => s + sp.porcentaje, 0) !== 100 && (
              <p className="text-[10px] text-red-500 mt-1">Los splits deben sumar 100% (actual: {params.splits.reduce((s, sp) => s + sp.porcentaje, 0)}%)</p>
            )}
          </div>
        </div>

        {/* Indicadores */}
        <div className="space-y-3">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-[10px] text-gray-500 mb-1">{params.modalidad === 'propia' ? 'Capital requerido' : 'Máx. endeudamiento'}</p>
            <p className="text-xl font-bold text-gray-900">{formatearMoneda(Math.round(ind.capital_requerido))}</p>
            <p className="text-[10px] text-gray-400 mt-1">Promedio: {formatearMoneda(Math.round(ind.capital_promedio))}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-[10px] text-gray-500 mb-1">{params.modalidad === 'propia' ? 'CT' : 'Deuda'} / OA</p>
            <p className="text-xl font-bold text-gray-900">{(ind.ct_deuda_ratio * 100).toFixed(1)}%</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-[10px] text-gray-500 mb-1">Rent. anual s/capital</p>
            <p className={`text-2xl font-bold ${ind.rent_anual_capital >= 0 ? 'text-green-600' : 'text-red-600'}`}>{fmtPct(ind.rent_anual_capital)}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-[10px] text-gray-500 mb-1">Rent. s/OA</p>
            <p className={`text-xl font-bold ${ind.rent_sobre_order >= 0 ? 'text-green-600' : 'text-red-600'}`}>{fmtPct(ind.rent_sobre_order)}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-[10px] text-gray-500 mb-1">Payback</p>
            <p className="text-xl font-bold text-gray-900">{ind.payback > 0 ? `Mes ${ind.payback}` : 'No recupera'}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-[10px] text-gray-500 mb-1">Margen neto / op</p>
            <p className="text-xl font-bold text-gray-900">{formatearMoneda(Math.round(ind.margen_neto_op))}</p>
          </div>
          <button
            onClick={handleGuardar}
            disabled={saving || params.splits.reduce((s, sp) => s + sp.porcentaje, 0) !== 100}
            className="w-full px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Guardando...' : 'Guardar como producto'}
          </button>
        </div>
      </div>

      {/* Tabla del flujo */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-200 bg-gray-50">
          <h3 className="font-semibold text-gray-900 text-sm">Flujo de fondos</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full" style={{ fontSize: '10px' }}>
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-2 py-1.5 font-semibold text-gray-600 sticky left-0 bg-gray-50 min-w-[120px]">Concepto</th>
                {Array.from({ length: sim.meses }, (_, i) => (
                  <th key={i} className="text-right px-1.5 py-1.5 font-semibold text-gray-500 min-w-[60px]">Mes {i}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sim.filas.map((fila, idx) => (
                <tr key={idx} className={fila.esSubtotal ? 'bg-gray-50 font-bold' : fila.esAcumulado ? 'bg-blue-50 font-bold' : ''}>
                  <td className={`px-2 py-1 sticky left-0 ${fila.esSubtotal ? 'bg-gray-50 text-gray-900' : fila.esAcumulado ? 'bg-blue-50 text-blue-900' : 'bg-white text-gray-700'}`}>
                    {fila.concepto}
                  </td>
                  {fila.valores.map((v, m) => (
                    <td key={m} className={`px-1.5 py-1 text-right ${
                      fila.esAcumulado
                        ? v >= 0 ? 'text-green-700' : 'text-red-700'
                        : fila.esSubtotal
                        ? v >= 0 ? 'text-green-700' : 'text-red-700'
                        : v > 0 ? 'text-green-700' : v < 0 ? 'text-red-700' : 'text-gray-300'
                    }`}>
                      {fmtK(Math.round(v))}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="px-5 py-2 text-[9px] text-gray-400">* Ingreso por colocación: tasa de financiación - 7pp, aplicada sobre saldo positivo acumulado.</p>
      </div>

      {/* Productos guardados */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <button
          onClick={() => setShowProductos(!showProductos)}
          className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-50 transition-colors"
        >
          <h3 className="font-semibold text-gray-900">Productos guardados ({productos.length})</h3>
          <svg className={`w-5 h-5 text-gray-400 transition-transform ${showProductos ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {showProductos && (
          <div className="border-t border-gray-200">
            {productos.length === 0 ? (
              <p className="p-5 text-sm text-gray-400 text-center">No hay productos guardados</p>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="text-left px-4 py-2 font-medium text-gray-600">Nombre</th>
                    <th className="text-right px-4 py-2 font-medium text-gray-600">Rent. anual</th>
                    <th className="text-right px-4 py-2 font-medium text-gray-600">Margen/op</th>
                    <th className="text-right px-4 py-2 font-medium text-gray-600">Cap. req.</th>
                    <th className="text-center px-4 py-2 font-medium text-gray-600">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {productos.map(p => {
                    const pInd = p.indicadores as unknown as Indicadores
                    return (
                      <tr key={p.id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="px-4 py-2 text-gray-900 font-medium">{p.nombre}</td>
                        <td className={`px-4 py-2 text-right ${pInd.rent_anual_capital >= 0 ? 'text-green-600' : 'text-red-600'}`}>{fmtPct(pInd.rent_anual_capital)}</td>
                        <td className="px-4 py-2 text-right">{formatearMoneda(Math.round(pInd.margen_neto_op))}</td>
                        <td className="px-4 py-2 text-right">{formatearMoneda(Math.round(pInd.capital_requerido))}</td>
                        <td className="px-4 py-2 text-center flex gap-2 justify-center">
                          <button onClick={() => cargarProducto(p)} className="px-2 py-1 text-[10px] bg-blue-100 text-blue-700 rounded hover:bg-blue-200">Cargar</button>
                          <button onClick={async () => { await eliminarProducto(p.id); router.refresh() }} className="px-2 py-1 text-[10px] bg-red-100 text-red-700 rounded hover:bg-red-200">Eliminar</button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
