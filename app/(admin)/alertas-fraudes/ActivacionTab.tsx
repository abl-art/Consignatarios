'use client'

import { useState, useMemo } from 'react'
import type { ActivacionRow, PDHardRow } from '@/lib/gocelular'

const MERCHANTS: Record<string, string> = {
  '1': 'Otros',
  '2026134': 'GOcelular Directo',
  '2461631': 'Ecommerce GOcelular',
  '5495277': 'RIIING',
  '6033574': 'TECNO COMPRO',
}

function merchantName(clientId: string): string {
  return MERCHANTS[clientId] ?? `Merchant ${clientId}`
}

function tasaColor(tasa: number): string {
  if (tasa >= 95) return 'text-green-700'
  if (tasa >= 90) return 'text-amber-600'
  return 'text-red-700'
}

function tasaBg(tasa: number): string {
  if (tasa >= 95) return ''
  if (tasa >= 90) return 'bg-amber-50'
  return 'bg-red-50'
}

function pdColor(pd: number): string {
  if (pd <= 3) return 'text-green-700'
  if (pd <= 8) return 'text-amber-600'
  return 'text-red-700'
}

interface MesRow {
  mes: string
  asignados: number
  activos: number
  bloqueados: number
  ready: number
  devueltos: number
  tasa: number
  promDias: number
  pdHard: number
  denHard: number
  numHard: number
}

interface TiendaRow extends MesRow {
  storeName: string
  clientId: string
}

interface Props {
  data: ActivacionRow[]
  pdData: PDHardRow[]
}

export default function ActivacionTab({ data, pdData }: Props) {
  const [filtroMerchant, setFiltroMerchant] = useState('')
  const [expandedMes, setExpandedMes] = useState<string | null>(null)

  const merchants = useMemo(() => {
    const set = new Set(data.map(r => r.clientId))
    return Array.from(set).sort()
  }, [data])

  // Index PD data by mes+store for fast lookup
  const pdIndex = useMemo(() => {
    const map = new Map<string, PDHardRow>()
    for (const r of pdData) map.set(`${r.mes}|${r.storeName}`, r)
    return map
  }, [pdData])

  function getPD(mes: string, storeName: string): PDHardRow | undefined {
    return pdIndex.get(`${mes}|${storeName}`)
  }

  // Filtered data
  const filtered = useMemo(() => {
    if (!filtroMerchant) return data
    return data.filter(r => r.clientId === filtroMerchant)
  }, [data, filtroMerchant])

  const filteredPD = useMemo(() => {
    if (!filtroMerchant) return pdData
    return pdData.filter(r => r.clientId === filtroMerchant)
  }, [pdData, filtroMerchant])

  // Aggregate by month (company totals)
  const porMes: MesRow[] = useMemo(() => {
    const map = new Map<string, { asignados: number; activos: number; bloqueados: number; ready: number; devueltos: number; sumaDias: number; countDias: number; denHard: number; numHard: number }>()
    for (const r of filtered) {
      const activados = r.activos + r.bloqueados
      const existing = map.get(r.mesOriginacion)
      if (existing) {
        existing.asignados += r.asignados
        existing.activos += r.activos
        existing.bloqueados += r.bloqueados
        existing.ready += r.ready
        existing.devueltos += r.devueltos
        if (r.promDias > 0 && activados > 0) {
          existing.sumaDias += r.promDias * activados
          existing.countDias += activados
        }
      } else {
        map.set(r.mesOriginacion, {
          asignados: r.asignados, activos: r.activos, bloqueados: r.bloqueados,
          ready: r.ready, devueltos: r.devueltos,
          sumaDias: r.promDias > 0 && activados > 0 ? r.promDias * activados : 0,
          countDias: r.promDias > 0 && activados > 0 ? activados : 0,
          denHard: 0, numHard: 0,
        })
      }
    }
    // Merge PD data
    for (const r of filteredPD) {
      const existing = map.get(r.mes)
      if (existing) {
        existing.denHard += r.denHard
        existing.numHard += r.numHard
      }
    }
    return Array.from(map.entries()).map(([mes, v]) => ({
      mes,
      ...v,
      tasa: v.asignados > 0 ? Math.round(((v.activos + v.bloqueados) / v.asignados) * 1000) / 10 : 0,
      promDias: v.countDias > 0 ? Math.round((v.sumaDias / v.countDias) * 10) / 10 : 0,
      pdHard: v.denHard > 0 ? Math.round((v.numHard / v.denHard) * 1000) / 10 : 0,
    })).sort((a, b) => b.mes.localeCompare(a.mes))
  }, [filtered, filteredPD])

  // Detail by store for expanded month
  const detalleTienda: TiendaRow[] = useMemo(() => {
    if (!expandedMes) return []
    const mesData = filtered.filter(r => r.mesOriginacion === expandedMes)
    const map = new Map<string, { storeName: string; clientId: string; asignados: number; activos: number; bloqueados: number; ready: number; devueltos: number; sumaDias: number; countDias: number; denHard: number; numHard: number }>()
    for (const r of mesData) {
      const key = r.storeName
      const activados = r.activos + r.bloqueados
      const pd = getPD(expandedMes, r.storeName)
      const existing = map.get(key)
      if (existing) {
        existing.asignados += r.asignados
        existing.activos += r.activos
        existing.bloqueados += r.bloqueados
        existing.ready += r.ready
        existing.devueltos += r.devueltos
        if (r.promDias > 0 && activados > 0) {
          existing.sumaDias += r.promDias * activados
          existing.countDias += activados
        }
      } else {
        map.set(key, {
          storeName: r.storeName, clientId: r.clientId,
          asignados: r.asignados, activos: r.activos, bloqueados: r.bloqueados,
          ready: r.ready, devueltos: r.devueltos,
          sumaDias: r.promDias > 0 && activados > 0 ? r.promDias * activados : 0,
          countDias: r.promDias > 0 && activados > 0 ? activados : 0,
          denHard: pd?.denHard ?? 0, numHard: pd?.numHard ?? 0,
        })
      }
    }
    return Array.from(map.values()).map(v => ({
      ...v,
      mes: expandedMes,
      tasa: v.asignados > 0 ? Math.round(((v.activos + v.bloqueados) / v.asignados) * 1000) / 10 : 0,
      promDias: v.countDias > 0 ? Math.round((v.sumaDias / v.countDias) * 10) / 10 : 0,
      pdHard: v.denHard > 0 ? Math.round((v.numHard / v.denHard) * 1000) / 10 : 0,
    })).sort((a, b) => a.tasa - b.tasa)
  }, [filtered, expandedMes, pdIndex])

  // Totals
  const totales = useMemo(() => {
    const t = porMes.reduce((s, r) => ({
      asignados: s.asignados + r.asignados, activos: s.activos + r.activos,
      bloqueados: s.bloqueados + r.bloqueados, ready: s.ready + r.ready,
      denHard: s.denHard + r.denHard, numHard: s.numHard + r.numHard,
    }), { asignados: 0, activos: 0, bloqueados: 0, ready: 0, denHard: 0, numHard: 0 })
    return {
      ...t,
      tasa: t.asignados > 0 ? Math.round(((t.activos + t.bloqueados) / t.asignados) * 1000) / 10 : 0,
      pdHard: t.denHard > 0 ? Math.round((t.numHard / t.denHard) * 1000) / 10 : 0,
    }
  }, [porMes])

  function toggleMes(mes: string) {
    setExpandedMes(prev => prev === mes ? null : mes)
  }

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">Asignados</p>
          <p className="text-2xl font-bold text-gray-900">{totales.asignados.toLocaleString('es-AR')}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">Activados</p>
          <p className="text-2xl font-bold text-green-700">{(totales.activos + totales.bloqueados).toLocaleString('es-AR')}</p>
          <p className="text-[10px] text-gray-400">{totales.activos} activos + {totales.bloqueados} bloqueados</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">Tasa de activacion</p>
          <p className={`text-2xl font-bold ${tasaColor(totales.tasa)}`}>{totales.tasa}%</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">Listo para usar</p>
          <p className="text-2xl font-bold text-blue-700">{totales.ready}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">PD Hard cuota 2</p>
          <p className={`text-2xl font-bold ${pdColor(totales.pdHard)}`}>{totales.pdHard}%</p>
        </div>
      </div>

      {/* Filtro merchant */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-wrap gap-4 items-end">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Merchant</label>
          <select value={filtroMerchant} onChange={e => { setFiltroMerchant(e.target.value); setExpandedMes(null) }}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm min-w-[200px]">
            <option value="">Todos los merchants</option>
            {merchants.map(m => <option key={m} value={m}>{merchantName(m)}</option>)}
          </select>
        </div>
        {filtroMerchant && (
          <button onClick={() => { setFiltroMerchant(''); setExpandedMes(null) }}
            className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700 underline">
            Limpiar
          </button>
        )}
        <p className="text-xs text-gray-400 ml-auto">Clic en una fila para ver detalle por sucursal</p>
      </div>

      {/* Tabla por mes */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="w-8 px-3 py-3"></th>
              <th className="text-left px-2 py-3 font-medium text-gray-600">Mes</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Asignados</th>
              <th className="text-right px-4 py-3 font-medium text-green-700">Activados</th>
              <th className="text-right px-4 py-3 font-medium text-blue-700">Ready</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Bloqueados</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Tasa activ.</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">P50 dias</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">PD Hard C2</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {porMes.flatMap(r => {
              const isExpanded = expandedMes === r.mes
              const tiendas = isExpanded ? detalleTienda : []
              const rows = [
                <tr key={r.mes} onClick={() => toggleMes(r.mes)}
                  className={`cursor-pointer hover:bg-gray-100 ${tasaBg(r.tasa)} ${isExpanded ? 'font-semibold bg-gray-50' : ''}`}>
                  <td className="px-3 py-3 text-gray-400 text-xs">{isExpanded ? '▼' : '▶'}</td>
                  <td className="px-2 py-3 font-medium text-gray-900">{r.mes}</td>
                  <td className="px-4 py-3 text-right text-gray-700">{r.asignados}</td>
                  <td className="px-4 py-3 text-right text-green-700 font-medium">{r.activos + r.bloqueados}</td>
                  <td className="px-4 py-3 text-right text-blue-700">{r.ready}</td>
                  <td className="px-4 py-3 text-right text-gray-500">{r.bloqueados}</td>
                  <td className={`px-4 py-3 text-right font-bold ${tasaColor(r.tasa)}`}>{r.tasa}%</td>
                  <td className="px-4 py-3 text-right text-gray-600">{r.promDias > 0 ? `${r.promDias}d` : '—'}</td>
                  <td className={`px-4 py-3 text-right font-bold ${pdColor(r.pdHard)}`}>{r.pdHard}%</td>
                </tr>,
                ...tiendas.map(t => (
                  <tr key={`${r.mes}-${t.storeName}`} className={`text-xs ${tasaBg(t.tasa)} border-l-4 border-l-indigo-300`}>
                    <td className="px-3 py-2"></td>
                    <td className="px-2 py-2 text-gray-700 max-w-[250px] truncate" title={t.storeName}>
                      {t.storeName}
                    </td>
                    <td className="px-4 py-2 text-right text-gray-500">{t.asignados}</td>
                    <td className="px-4 py-2 text-right text-green-700">{t.activos + t.bloqueados}</td>
                    <td className="px-4 py-2 text-right text-blue-600">{t.ready}</td>
                    <td className="px-4 py-2 text-right text-gray-400">{t.bloqueados}</td>
                    <td className={`px-4 py-2 text-right font-bold ${tasaColor(t.tasa)}`}>{t.tasa}%</td>
                    <td className="px-4 py-2 text-right text-gray-500">{t.promDias > 0 ? `${t.promDias}d` : '—'}</td>
                    <td className={`px-4 py-2 text-right font-bold ${pdColor(t.pdHard)}`}>{t.pdHard}%</td>
                  </tr>
                )),
              ]
              return rows
            })}
          </tbody>
          {porMes.length > 1 && (
            <tfoot className="bg-gray-50 border-t-2 border-gray-200">
              <tr className="font-semibold">
                <td className="px-3 py-3"></td>
                <td className="px-2 py-3 text-gray-900">Total</td>
                <td className="px-4 py-3 text-right text-gray-900">{totales.asignados}</td>
                <td className="px-4 py-3 text-right text-green-700">{totales.activos + totales.bloqueados}</td>
                <td className="px-4 py-3 text-right text-blue-700">{totales.ready}</td>
                <td className="px-4 py-3 text-right text-gray-500">{totales.bloqueados}</td>
                <td className={`px-4 py-3 text-right font-bold ${tasaColor(totales.tasa)}`}>{totales.tasa}%</td>
                <td className="px-4 py-3"></td>
                <td className={`px-4 py-3 text-right font-bold ${pdColor(totales.pdHard)}`}>{totales.pdHard}%</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <p className="text-xs text-gray-400">
        * Tasa activacion = (activos + bloqueados) / asignados. Rojo &lt;90%, amarillo 90-95%, verde +95%.
        PD Hard C2 = default cuota 2 (primer pago post-compra), impago o cobrado +1 dia tarde.
        Dias = mediana (P50) asignacion a activo, excluyendo &gt;40d.
      </p>
    </div>
  )
}
