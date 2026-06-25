'use client'

import { useState, useTransition } from 'react'
import { fetchResultadoTienda, updateConfig, type ResultadoData, type ConfigResultado } from '@/lib/actions/resultado'

function fmt(n: number): string { return n.toLocaleString('es-AR') }
function fmtPesos(n: number): string { return '$' + n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) }
function fmtPct(n: number): string { return n.toFixed(1) + '%' }

function today(): string { return new Date().toISOString().slice(0, 10) }
function daysAgo(n: number): string { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10) }
function monthStart(offset: number = 0): string {
  const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - offset); return d.toISOString().slice(0, 10)
}
function monthEnd(offset: number = 0): string {
  const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - offset + 1); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10)
}
function monthLabel(offset: number): string {
  const d = new Date(); d.setMonth(d.getMonth() - offset)
  return d.toLocaleString('es-AR', { month: 'long', year: 'numeric' })
}

const PRESETS = [
  { label: 'Ayer', desde: () => daysAgo(1), hasta: () => daysAgo(1) },
  { label: monthLabel(0), desde: () => monthStart(0), hasta: () => today() },
  { label: 'Últimos 30 días', desde: () => daysAgo(30), hasta: () => today() },
  { label: monthLabel(1), desde: () => monthStart(1), hasta: () => monthEnd(1) },
] as const

const FILAS_MAIN: { key: keyof Omit<import('@/lib/actions/resultado').ProductoResultado, 'nombre' | 'kind'>; label: string; format: 'pesos' | 'number' | 'pct' | 'multiplo' | 'usd'; bold?: boolean; separator?: boolean; note?: string }[] = [
  { key: 'unidades', label: 'Unidades vendidas', format: 'number' },
  { key: 'precio_venta_neto', label: 'Precio venta neto (s/IVA)', format: 'pesos' },
  { key: 'costo', label: 'Costo proveedor', format: 'pesos' },
  { key: 'multiplo', label: 'Múltiplo', format: 'multiplo' },
  { key: 'kit', label: 'Kit de Seguridad', format: 'pesos' },
  { key: 'envio', label: 'Envío + Fulfillment', format: 'pesos' },
  { key: 'licencias_bloqueo', label: 'Licencias de bloqueo', format: 'pesos' },
  { key: 'contribucion_bruta', label: 'Contribución Bruta', format: 'pesos', bold: true, separator: true },
  { key: 'adquirencia', label: 'Adquirencia', format: 'pesos' },
  { key: 'incobrables', label: 'Incobrables', format: 'pesos' },
  { key: 'sueldos', label: 'Sueldos', format: 'pesos' },
  { key: 'otros_costo', label: 'Otros', format: 'pesos' },
  { key: 'intereses', label: 'Intereses', format: 'pesos' },
  { key: 'impuestos', label: 'Impuestos *', format: 'pesos', note: '* Incluye Ingresos Brutos + Comercio e Industria + Débitos y Créditos (1,2%)' },
  { key: 'contribucion_neta', label: 'Contribución Neta', format: 'pesos', bold: true, separator: true },
  { key: 'rentabilidad_costo', label: 'Rentabilidad s/costo', format: 'pct' },
  { key: 'rentabilidad_venta', label: 'Rentabilidad s/venta', format: 'pct' },
  { key: 'ganancia', label: 'Ganancia total', format: 'pesos', bold: true, separator: true },
  { key: 'ganancia_usd', label: 'Ganancia en USD', format: 'usd', bold: true },
]

function formatCell(value: number, format: string, kind: 'main' | 'addon', key: string): string {
  // Addons don't have kit, envio, licencias, sueldos, otros, intereses
  if (kind === 'addon' && ['kit', 'envio', 'licencias_bloqueo', 'sueldos', 'otros_costo', 'intereses'].includes(key)) return '—'
  if (format === 'pesos') return fmtPesos(value)
  if (format === 'usd') return 'US$ ' + fmt(value)
  if (format === 'pct') return fmtPct(value)
  if (format === 'multiplo') return value > 0 ? value.toFixed(2) + 'x' : '—'
  return fmt(value)
}

interface Props {
  data: ResultadoData
  desde: string
  hasta: string
}

export default function ResultadoTab({ data: initialData, desde: initDesde, hasta: initHasta }: Props) {
  const [data, setData] = useState(initialData)
  const [desde, setDesde] = useState(initDesde)
  const [hasta, setHasta] = useState(initHasta)
  const [activePreset, setActivePreset] = useState<number | null>(2) // últimos 30 días
  const [isPending, startTransition] = useTransition()
  const [showConfig, setShowConfig] = useState(false)
  const [localConfig, setLocalConfig] = useState<ConfigResultado>(initialData.config)

  function reload(d: string, h: string, presetIdx: number | null) {
    setDesde(d); setHasta(h); setActivePreset(presetIdx)
    startTransition(async () => { setData(await fetchResultadoTienda(d, h)) })
  }

  function handlePreset(idx: number) {
    const p = PRESETS[idx]; reload(p.desde(), p.hasta(), idx)
  }

  function handleCustomRange() {
    if (desde && hasta) reload(desde, hasta, null)
  }

  async function handleConfigChange(clave: string, valor: number) {
    setLocalConfig(prev => ({ ...prev, [clave]: valor }))
    await updateConfig(clave, valor)
    // Reload data with new config
    startTransition(async () => { setData(await fetchResultadoTienda(desde, hasta)) })
  }

  const { productos, totals } = data
  const mainProducts = productos.filter(p => p.kind === 'main')
  const addonProducts = productos.filter(p => p.kind === 'addon')
  const allProducts = [...mainProducts, ...addonProducts]

  return (
    <div className={`space-y-6 ${isPending ? 'opacity-50 pointer-events-none' : ''}`}>
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        {PRESETS.map((p, i) => (
          <button key={i} onClick={() => handlePreset(i)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${activePreset === i ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            {p.label}
          </button>
        ))}
        <span className="text-gray-300">|</span>
        <input type="date" value={desde} onChange={e => { setDesde(e.target.value); setActivePreset(null) }}
          className="px-2 py-1.5 text-xs border border-gray-200 rounded-lg" />
        <span className="text-xs text-gray-400">a</span>
        <input type="date" value={hasta} onChange={e => { setHasta(e.target.value); setActivePreset(null) }}
          className="px-2 py-1.5 text-xs border border-gray-200 rounded-lg" />
        <button onClick={handleCustomRange}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${activePreset === null ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
          Aplicar
        </button>
        <span className="text-gray-300 ml-1">|</span>
        <button onClick={() => setShowConfig(!showConfig)}
          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 flex items-center gap-1">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
          Parámetros
        </button>
      </div>

      {/* Config panel */}
      {showConfig && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Parámetros del resultado</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {([
              { clave: 'kit_seguridad', label: 'Kit de Seguridad', suffix: '$/ud' },
              { clave: 'envio_fulfillment', label: 'Envío + Fulfillment', suffix: '$/ud' },
              { clave: 'licencias_bloqueo', label: 'Licencias de bloqueo', suffix: '$/ud' },
              { clave: 'sueldos', label: 'Sueldos', suffix: '$/ud' },
              { clave: 'otros', label: 'Otros', suffix: '$/ud' },
              { clave: 'adquirencia', label: 'Adquirencia', suffix: '%' },
              { clave: 'incobrables', label: 'Incobrables', suffix: '%' },
              { clave: 'iibb', label: 'Ingresos Brutos', suffix: '%' },
              { clave: 'com_e_ind', label: 'Comercio e Industria', suffix: '%' },
              { clave: 'tna', label: 'TNA', suffix: '%' },
              { clave: 'plazo_pago_proveedor', label: 'Plazo pago proveedor', suffix: 'días' },
              { clave: 'tipo_cambio', label: 'Tipo de cambio', suffix: 'ARS/USD' },
            ] as const).map(({ clave, label, suffix }) => (
              <div key={clave}>
                <label className="text-xs text-gray-500 block mb-1">{label}</label>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    step={suffix === '%' ? '0.1' : '1'}
                    value={localConfig[clave as keyof ConfigResultado]}
                    onChange={e => {
                      const val = parseFloat(e.target.value)
                      if (!isNaN(val)) handleConfigChange(clave, val)
                    }}
                    className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg font-mono"
                  />
                  <span className="text-xs text-gray-400 shrink-0">{suffix}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
          <p className="text-xs text-gray-500 mb-1">Unidades vendidas</p>
          <p className="text-2xl font-bold text-gray-900 font-mono">{fmt(totals.unidades)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
          <p className="text-xs text-gray-500 mb-1">Revenue neto (s/IVA)</p>
          <p className="text-2xl font-bold text-gray-900 font-mono">{fmtPesos(totals.revenue_neto)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
          <p className="text-xs text-gray-500 mb-1">Contribución Neta</p>
          <p className="text-2xl font-bold text-emerald-600 font-mono">{fmtPesos(totals.contribucion_neta)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
          <p className="text-xs text-gray-500 mb-1">Ganancia total</p>
          <p className="text-2xl font-bold text-emerald-600 font-mono">{fmtPesos(totals.ganancia)}</p>
        </div>
      </div>

      {/* P&L Table */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-700">Estado de Resultado por producto</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 sticky left-0 bg-gray-50 min-w-[180px]">Concepto</th>
                {allProducts.map((p, i) => (
                  <th key={i} className="px-3 py-2.5 text-right text-xs font-medium text-gray-500 min-w-[110px]">
                    <span className="block">{p.nombre}</span>
                    {p.kind === 'addon' && <span className="text-[10px] text-purple-500 font-normal">(addon)</span>}
                  </th>
                ))}
                <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-700 min-w-[110px] bg-gray-100">Total</th>
              </tr>
            </thead>
            <tbody>
              {FILAS_MAIN.map(fila => {
                const isGanancia = fila.key === 'ganancia' || fila.key === 'ganancia_usd'
                return (
                  <tr key={fila.key} className={`border-b ${fila.separator ? 'border-gray-200' : 'border-gray-50'} ${fila.bold ? 'bg-gray-50' : ''} ${isGanancia ? 'bg-emerald-50' : ''}`}>
                    <td className={`px-4 py-2 text-xs sticky left-0 ${fila.bold ? 'font-semibold text-gray-900 bg-gray-50' : 'text-gray-600'} ${isGanancia ? 'font-bold text-emerald-800 bg-emerald-50' : ''}`}>
                      {fila.label}
                    </td>
                    {allProducts.map((p, i) => {
                      const val = p[fila.key] as number
                      return (
                        <td key={i} className={`px-3 py-2 text-right font-mono text-xs ${fila.bold ? 'font-semibold' : ''} ${isGanancia ? 'font-bold text-emerald-700' : ''} ${val < 0 ? 'text-red-500' : ''}`}>
                          {formatCell(val, fila.format, p.kind, fila.key)}
                        </td>
                      )
                    })}
                    <td className={`px-3 py-2 text-right font-mono text-xs font-semibold bg-gray-100 ${isGanancia ? 'text-emerald-700 font-bold' : ''}`}>
                      {fila.key === 'unidades' ? fmt(totals.unidades)
                        : fila.key === 'ganancia' ? fmtPesos(totals.ganancia)
                        : fila.key === 'ganancia_usd' ? 'US$ ' + fmt(totals.ganancia_usd)
                        : fila.key === 'contribucion_bruta' ? fmtPesos(totals.contribucion_bruta)
                        : fila.key === 'contribucion_neta' ? fmtPesos(totals.contribucion_neta)
                        : fila.key === 'precio_venta_neto' ? fmtPesos(totals.revenue_neto / (totals.unidades || 1))
                        : fila.key === 'costo' ? fmtPesos(totals.costo_total / (totals.unidades || 1))
                        : fila.format === 'pct' ? fmtPct(totals.ganancia > 0 && totals.costo_total > 0
                            ? fila.key === 'rentabilidad_costo' ? (totals.contribucion_neta / totals.costo_total) * 100
                            : (totals.contribucion_neta / totals.revenue_neto) * 100
                          : 0)
                        : ''}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-3 border-t border-gray-100">
          <p className="text-[11px] text-gray-400">* Impuestos incluye: Ingresos Brutos ({localConfig.iibb}%) + Comercio e Industria ({localConfig.com_e_ind}%) + Débitos y Créditos (1,2%)</p>
        </div>
      </div>

      {allProducts.length === 0 && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-8 text-center">
          <p className="text-sm text-gray-400">Sin ventas propias en el período seleccionado</p>
        </div>
      )}
    </div>
  )
}
