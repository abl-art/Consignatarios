'use client'

import { useState, useTransition, useMemo } from 'react'
import { fetchResultadoTienda, updateConfig, type ResultadoData, type ConfigResultado } from '@/lib/actions/resultado'
import { fetchResultadoTerceros, type ResultadoTercerosData } from '@/lib/actions/resultado-terceros'

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

// Unified rows for both P&Ls
interface FilaDef {
  key: string
  label: string
  format: 'pesos' | 'number' | 'pct' | 'multiplo' | 'usd'
  bold?: boolean
  separator?: boolean
  propiaOnly?: boolean   // only applies to venta propia
  tercerosOnly?: boolean // only applies to terceros
}

const FILAS: FilaDef[] = [
  { key: 'unidades', label: 'Unidades vendidas', format: 'number' },
  { key: 'revenue', label: 'Revenue neto (s/IVA)', format: 'pesos' },
  { key: 'costo', label: 'Costo proveedor', format: 'pesos', propiaOnly: true },
  { key: 'multiplo', label: 'Múltiplo', format: 'multiplo', propiaOnly: true },
  { key: 'order_amount', label: 'Monto total orders', format: 'pesos', tercerosOnly: true },
  { key: 'kit', label: 'Kit de Seguridad', format: 'pesos', propiaOnly: true },
  { key: 'envio', label: 'Envío + Fulfillment', format: 'pesos', propiaOnly: true },
  { key: 'contribucion_bruta', label: 'Contribución Bruta', format: 'pesos', bold: true, separator: true, propiaOnly: true },
  { key: 'licencias_bloqueo', label: 'Licencias de bloqueo', format: 'pesos' },
  { key: 'sueldos', label: 'Sueldos', format: 'pesos' },
  { key: 'otros_costo', label: 'Otros', format: 'pesos', propiaOnly: true },
  { key: 'adquirencia', label: 'Adquirencia', format: 'pesos' },
  { key: 'incobrables', label: 'Incobrables', format: 'pesos' },
  { key: 'intereses', label: 'Intereses', format: 'pesos' },
  { key: 'impuestos', label: 'Impuestos *', format: 'pesos' },
  { key: 'contribucion_neta', label: 'Contribución Neta', format: 'pesos', bold: true, separator: true },
  { key: 'rentabilidad', label: 'Rentabilidad', format: 'pct' },
  { key: 'ganancia', label: 'Ganancia total', format: 'pesos', bold: true, separator: true },
  { key: 'ganancia_usd', label: 'Ganancia en USD', format: 'usd', bold: true },
]

function getPropiaTotal(key: string, t: ResultadoData['totals']): number | null {
  switch (key) {
    case 'unidades': return t.unidades
    case 'revenue': return t.revenue_neto
    case 'costo': return t.costo_total
    case 'multiplo': return t.costo_total > 0 ? t.revenue_neto / t.costo_total : 0
    case 'kit': return t.kit
    case 'envio': return t.envio
    case 'contribucion_bruta': return t.contribucion_bruta
    case 'licencias_bloqueo': return t.licencias_bloqueo
    case 'sueldos': return t.sueldos
    case 'otros_costo': return t.otros_costo
    case 'adquirencia': return t.adquirencia
    case 'incobrables': return t.incobrables
    case 'intereses': return t.intereses
    case 'impuestos': return t.impuestos
    case 'contribucion_neta': return t.contribucion_neta
    case 'rentabilidad': return t.revenue_neto > 0 ? (t.contribucion_neta / t.revenue_neto) * 100 : 0
    case 'ganancia': return t.ganancia
    case 'ganancia_usd': return t.ganancia_usd
    default: return null
  }
}

function getTercerosTotal(key: string, t: ResultadoTercerosData['totals']): number | null {
  switch (key) {
    case 'unidades': return t.unidades
    case 'revenue': return t.revenue_gocuotas
    case 'order_amount': return t.order_amount_total
    case 'licencias_bloqueo': return t.licencias_bloqueo
    case 'sueldos': return t.sueldos
    case 'adquirencia': return t.adquirencia
    case 'incobrables': return t.incobrables
    case 'intereses': return t.intereses
    case 'impuestos': return t.impuestos
    case 'contribucion_neta': return t.contribucion_neta
    case 'rentabilidad': return t.revenue_gocuotas > 0 ? (t.contribucion_neta / t.revenue_gocuotas) * 100 : 0
    case 'ganancia': return t.ganancia
    case 'ganancia_usd': return t.ganancia_usd
    default: return null
  }
}

function fmtVal(val: number | null, format: string): string {
  if (val === null) return '—'
  if (format === 'pesos') return fmtPesos(val)
  if (format === 'usd') return 'US$ ' + fmt(val)
  if (format === 'pct') return fmtPct(val)
  if (format === 'multiplo') return val > 0 ? val.toFixed(2) + 'x' : '—'
  return fmt(val)
}

interface Props {
  data: ResultadoData
  dataTerceros: ResultadoTercerosData
  desde: string
  hasta: string
}

export default function ResultadoTab({ data: initialData, dataTerceros: initialTerceros, desde: initDesde, hasta: initHasta }: Props) {
  const [data, setData] = useState(initialData)
  const [terceros, setTerceros] = useState(initialTerceros)
  const [desde, setDesde] = useState(initDesde)
  const [hasta, setHasta] = useState(initHasta)
  const [activePreset, setActivePreset] = useState<number | null>(2)
  const [isPending, startTransition] = useTransition()
  const [showConfig, setShowConfig] = useState(false)
  const [showPropia, setShowPropia] = useState(false)
  const [showTerceros, setShowTerceros] = useState(false)
  const [localConfig, setLocalConfig] = useState<ConfigResultado>(initialData.config)

  function reload(d: string, h: string, presetIdx: number | null) {
    setDesde(d); setHasta(h); setActivePreset(presetIdx)
    startTransition(async () => {
      const [r, t] = await Promise.all([fetchResultadoTienda(d, h), fetchResultadoTerceros(d, h)])
      setData(r); setTerceros(t)
    })
  }

  function handlePreset(idx: number) { const p = PRESETS[idx]; reload(p.desde(), p.hasta(), idx) }
  function handleCustomRange() { if (desde && hasta) reload(desde, hasta, null) }

  async function handleConfigChange(clave: string, valor: number) {
    setLocalConfig(prev => ({ ...prev, [clave]: valor }))
    await updateConfig(clave, valor)
    startTransition(async () => {
      const [r, t] = await Promise.all([fetchResultadoTienda(desde, hasta), fetchResultadoTerceros(desde, hasta)])
      setData(r); setTerceros(t)
    })
  }

  const { productos, totals } = data
  const allProducts = useMemo(() => {
    const main = productos.filter(p => p.kind === 'main')
    const addon = productos.filter(p => p.kind === 'addon')
    return [...main, ...addon]
  }, [productos])

  const { merchants, totals: tt } = terceros

  // Combined ganancia
  const gananciaTotal = totals.ganancia + tt.ganancia
  const gananciaUsdTotal = totals.ganancia_usd + tt.ganancia_usd

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
                  <input type="number" step={suffix === '%' ? '0.1' : '1'}
                    value={localConfig[clave as keyof ConfigResultado]}
                    onChange={e => { const val = parseFloat(e.target.value); if (!isNaN(val)) handleConfigChange(clave, val) }}
                    className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg font-mono" />
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
          <p className="text-xs text-gray-500 mb-1">Uds. Propia + Terceros</p>
          <p className="text-2xl font-bold text-gray-900 font-mono">{fmt(totals.unidades + tt.unidades)}</p>
          <p className="text-xs text-gray-400 mt-1">{fmt(totals.unidades)} propia + {fmt(tt.unidades)} terceros</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
          <p className="text-xs text-gray-500 mb-1">Revenue total</p>
          <p className="text-2xl font-bold text-gray-900 font-mono">{fmtPesos(totals.revenue_neto + tt.revenue_gocuotas)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
          <p className="text-xs text-gray-500 mb-1">Ganancia total</p>
          <p className="text-2xl font-bold text-emerald-600 font-mono">{fmtPesos(gananciaTotal)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
          <p className="text-xs text-gray-500 mb-1">Ganancia USD</p>
          <p className="text-2xl font-bold text-emerald-600 font-mono">US$ {fmt(gananciaUsdTotal)}</p>
        </div>
      </div>

      {/* Unified P&L Table */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-700">Estado de Resultado</h3>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowPropia(!showPropia)}
              className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${showPropia ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {showPropia ? 'Modelos ▾' : 'Modelos ▸'}
            </button>
            <button onClick={() => setShowTerceros(!showTerceros)}
              className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${showTerceros ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {showTerceros ? 'Merchants ▾' : 'Merchants ▸'}
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 sticky left-0 bg-gray-50 min-w-[180px]">Concepto</th>
                {/* Venta Propia detail columns */}
                {showPropia && allProducts.map((p, i) => (
                  <th key={`p-${i}`} className="px-3 py-2.5 text-right text-xs font-medium text-blue-500 min-w-[100px]">
                    <span className="block truncate max-w-[100px]" title={p.nombre}>{p.nombre}</span>
                    {p.kind === 'addon' && <span className="text-[10px] text-purple-400 font-normal">(addon)</span>}
                  </th>
                ))}
                {/* Venta Propia total */}
                <th className="px-3 py-2.5 text-right text-xs font-semibold text-blue-700 min-w-[120px] bg-blue-50">Vta. Propia</th>
                {/* Terceros detail columns */}
                {showTerceros && merchants.map(m => (
                  <th key={m.client_id} className="px-3 py-2.5 text-right text-xs font-medium text-purple-500 min-w-[100px]">
                    {m.merchant_name}
                  </th>
                ))}
                {/* Terceros total */}
                <th className="px-3 py-2.5 text-right text-xs font-semibold text-purple-700 min-w-[120px] bg-purple-50">Vta. Terceros</th>
              </tr>
            </thead>
            <tbody>
              {FILAS.map(fila => {
                const isGanancia = fila.key === 'ganancia' || fila.key === 'ganancia_usd'
                const propiaVal = getPropiaTotal(fila.key, totals)
                const tercerosVal = getTercerosTotal(fila.key, tt)
                const showRow = !fila.propiaOnly || propiaVal !== null
                if (!showRow) return null

                return (
                  <tr key={fila.key} className={`border-b ${fila.separator ? 'border-gray-200' : 'border-gray-50'} ${fila.bold ? 'bg-gray-50' : ''} ${isGanancia ? 'bg-emerald-50' : ''}`}>
                    <td className={`px-4 py-2 text-xs sticky left-0 ${fila.bold ? 'font-semibold text-gray-900 bg-gray-50' : 'text-gray-600'} ${isGanancia ? 'font-bold text-emerald-800 bg-emerald-50' : ''}`}>
                      {fila.label}
                    </td>
                    {/* Venta Propia detail */}
                    {showPropia && allProducts.map((p, i) => {
                      if (fila.tercerosOnly) return <td key={`p-${i}`} className="px-3 py-2 text-right text-xs text-gray-300">—</td>
                      const pRec = p as unknown as Record<string, number>
                      let val: number | null = null
                      if (fila.key === 'revenue') val = p.precio_venta_neto
                      else if (fila.key === 'rentabilidad') val = p.rentabilidad_venta
                      else val = pRec[fila.key] ?? null
                      // Addon exclusions
                      if (p.kind === 'addon' && ['kit', 'envio', 'licencias_bloqueo', 'sueldos', 'otros_costo', 'intereses', 'contribucion_bruta', 'costo', 'multiplo'].includes(fila.key)) val = null
                      return (
                        <td key={`p-${i}`} className={`px-3 py-2 text-right font-mono text-xs ${fila.bold ? 'font-semibold' : ''} ${isGanancia ? 'font-bold text-emerald-700' : ''} ${val !== null && val < 0 ? 'text-red-500' : ''}`}>
                          {val !== null ? fmtVal(val, fila.format) : '—'}
                        </td>
                      )
                    })}
                    {/* Venta Propia total */}
                    <td className={`px-3 py-2 text-right font-mono text-xs font-semibold bg-blue-50 ${isGanancia ? 'text-emerald-700 font-bold' : 'text-blue-900'}`}>
                      {fila.tercerosOnly ? '—'
                        : fila.key === 'unidades' ? `${fmt(totals.unidades)} (${fmt(totals.unidades_main)} cel. + ${fmt(totals.unidades_addon)} acc.)`
                        : fmtVal(propiaVal, fila.format)}
                    </td>
                    {/* Terceros detail */}
                    {showTerceros && merchants.map(m => {
                      if (fila.propiaOnly) return <td key={m.client_id} className="px-3 py-2 text-right text-xs text-gray-300">—</td>
                      const mRec = m as unknown as Record<string, number>
                      let val: number | null = null
                      if (fila.key === 'revenue') val = m.revenue_gocuotas / m.unidades
                      else if (fila.key === 'order_amount') val = m.order_amount_total / m.unidades
                      else if (fila.key === 'rentabilidad') val = m.rentabilidad_revenue
                      else if (fila.key === 'unidades') val = m.unidades
                      else if (fila.key === 'ganancia') val = m.ganancia
                      else if (fila.key === 'ganancia_usd') val = m.ganancia_usd
                      else {
                        // Per-unit for cost rows
                        const total = mRec[fila.key]
                        val = total !== undefined ? total / m.unidades : null
                      }
                      return (
                        <td key={m.client_id} className={`px-3 py-2 text-right font-mono text-xs ${fila.bold ? 'font-semibold' : ''} ${isGanancia ? 'font-bold text-emerald-700' : ''} ${val !== null && val < 0 ? 'text-red-500' : ''}`}>
                          {val !== null ? fmtVal(val, fila.key === 'unidades' ? 'number' : fila.format) : '—'}
                        </td>
                      )
                    })}
                    {/* Terceros total */}
                    <td className={`px-3 py-2 text-right font-mono text-xs font-semibold bg-purple-50 ${isGanancia ? 'text-emerald-700 font-bold' : 'text-purple-900'}`}>
                      {fila.propiaOnly ? '—' : fmtVal(tercerosVal, fila.key === 'unidades' ? 'number' : fila.format)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-3 border-t border-gray-100">
          <p className="text-[11px] text-gray-400">* Impuestos: IIBB ({localConfig.iibb}%) + Com e Ind ({localConfig.com_e_ind}%) + Déb/Créd (1,2%). En terceros: IIBB y Com e Ind sobre revenue GOcuotas, Déb/Créd sobre monto total orders.</p>
        </div>
      </div>

      {allProducts.length === 0 && merchants.length === 0 && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-8 text-center">
          <p className="text-sm text-gray-400">Sin ventas en el período seleccionado</p>
        </div>
      )}
    </div>
  )
}
