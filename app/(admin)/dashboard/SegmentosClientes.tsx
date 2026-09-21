'use client'

import { useState } from 'react'
import CanalPills, { type Canal } from '../finanzas/CanalPills'
import type { MixSegmentos } from '@/lib/segmentos'

// Mix de segmentos A1–D4 (Estructura de Crédito GO) de los compradores de
// GOcelular como cuadro de doble entrada: letra (límite) × número (antigüedad),
// con píldoras Total / Venta Propia / Venta de Terceros. La tabla
// segmentos_clientes se recalcula a diario contra Databricks (sync-segmentos).

const LETRAS = [
  { letra: 'A', detalle: 'Límite > 4.8 tickets' },
  { letra: 'B', detalle: 'Límite 2 – 4.8 tickets' },
  { letra: 'C', detalle: 'Límite 1 – 2 tickets' },
  { letra: 'D', detalle: 'Límite < 1 ticket' },
]

const NUMEROS = [
  { numero: '1', detalle: '+12 meses activo' },
  { numero: '2', detalle: '4–12 meses' },
  { numero: '3', detalle: '< 4 meses' },
  { numero: '4', detalle: 'Inactivos' },
]

export default function SegmentosClientes({ mix }: { mix: MixSegmentos }) {
  const [canal, setCanal] = useState<Canal>('total')
  if (mix.filas.length === 0) return null

  const valor = (f: { propia: number; terceros: number; total: number }) =>
    canal === 'propia' ? f.propia : canal === 'terceros' ? f.terceros : f.total
  const porSegmento = new Map(mix.filas.map(f => [f.segmento, valor(f)]))
  const totalCanal = canal === 'propia' ? mix.totalPropia : canal === 'terceros' ? mix.totalTerceros : mix.totalClientes
  const sinDatos = porSegmento.get('S/D') ?? 0
  const maxCelda = Math.max(1, ...LETRAS.flatMap(l => NUMEROS.map(n => porSegmento.get(`${l.letra}${n.numero}`) ?? 0)))

  const pct = (n: number) => (totalCanal === 0 ? '—' : `${((n / totalCanal) * 100).toFixed(1)}%`)
  const fecha = mix.actualizadoAt ? new Date(mix.actualizadoAt).toLocaleDateString('es-AR') : null

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 mt-4">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
        <h2 className="text-base font-semibold text-gray-900">Segmentos de clientes</h2>
        <span className="text-xs text-gray-400">
          {totalCanal.toLocaleString('es-AR')} compradores{fecha ? ` · actualizado ${fecha}` : ''}
        </span>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <p className="text-xs text-gray-500">Filas = límite asignado · Columnas = antigüedad desde la activación</p>
        <CanalPills canal={canal} onChange={setCanal} />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs border-separate" style={{ borderSpacing: '3px' }}>
          <thead>
            <tr>
              <th className="text-left font-medium text-gray-400 px-2 py-1"></th>
              {NUMEROS.map(n => (
                <th key={n.numero} className="px-2 py-1 text-center">
                  <span className="block text-sm font-bold text-gray-900">{n.numero}</span>
                  <span className="block text-[10px] font-normal text-gray-400">{n.detalle}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {LETRAS.map(l => (
              <tr key={l.letra}>
                <td className="px-2 py-1 whitespace-nowrap">
                  <span className="text-sm font-bold text-gray-900">{l.letra}</span>
                  <span className="block text-[10px] text-gray-400">{l.detalle}</span>
                </td>
                {NUMEROS.map(n => {
                  const seg = `${l.letra}${n.numero}`
                  const v = porSegmento.get(seg) ?? 0
                  const alpha = v === 0 ? 0 : 0.04 + (v / maxCelda) * 0.16
                  return (
                    <td
                      key={seg}
                      className="rounded-lg px-2 py-2.5 text-center align-middle"
                      style={{ backgroundColor: `rgba(17, 24, 39, ${alpha})` }}
                    >
                      <span className="block text-[10px] font-semibold text-gray-400">{seg}</span>
                      <span className="block text-sm font-bold text-gray-900">{v.toLocaleString('es-AR')}</span>
                      <span className="block text-[10px] text-gray-500">{pct(v)}</span>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[10px] text-gray-400 mt-3">
        % sobre los compradores del canal elegido. Un cliente que compró en ambos canales cuenta en los dos; en Total, una sola vez.
        {sinDatos > 0 && ` · ${sinDatos} clientes sin segmento (sin límite conocido en GOcuotas).`}
      </p>
    </div>
  )
}
