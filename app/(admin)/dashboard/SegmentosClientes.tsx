'use client'

import { useState } from 'react'
import Link from 'next/link'
import CanalPills, { type Canal } from '../finanzas/CanalPills'
import type { MixSegmentos } from '@/lib/segmentos'

// Mix de segmentos A1–D4 (Estructura de Crédito GO) de los compradores de
// GOcelular como cuadro de doble entrada: letra (límite) × número (antigüedad),
// con píldoras Total / Venta Propia / Venta de Terceros y totales por fila y
// columna. Headers y totales en magenta GOcuotas; las celdas van de verde
// (1, historial largo) a rojo (4, sin historial) con intensidad por volumen.

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
  { numero: '4', detalle: 'GOcelular fue su 1ª compra' },
]

// Verde (1) → rojo (4): rgb base por columna, la intensidad la da el volumen
const COLOR_NUMERO: Record<string, [number, number, number]> = {
  '1': [16, 185, 129], // emerald-500
  '2': [163, 196, 30], // lima
  '3': [249, 115, 22], // orange-500
  '4': [239, 68, 68], // red-500
}

export default function SegmentosClientes({ mix }: { mix: MixSegmentos }) {
  const [canal, setCanal] = useState<Canal>('total')
  if (mix.filas.length === 0) return null

  const valor = (f: { propia: number; terceros: number; total: number }) =>
    canal === 'propia' ? f.propia : canal === 'terceros' ? f.terceros : f.total
  const porSegmento = new Map(mix.filas.map(f => [f.segmento, valor(f)]))
  const totalCanal = canal === 'propia' ? mix.totalPropia : canal === 'terceros' ? mix.totalTerceros : mix.totalClientes
  const sinDatos = porSegmento.get('S/D') ?? 0
  const celda = (l: string, n: string) => porSegmento.get(`${l}${n}`) ?? 0
  const totalLetra = (l: string) => NUMEROS.reduce((s, n) => s + celda(l, n.numero), 0)
  const totalNumero = (n: string) => LETRAS.reduce((s, l) => s + celda(l.letra, n), 0)
  const totalMatriz = LETRAS.reduce((s, l) => s + totalLetra(l.letra), 0)
  const maxCelda = Math.max(1, ...LETRAS.flatMap(l => NUMEROS.map(n => celda(l.letra, n.numero))))

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
        <p className="text-xs text-gray-500">
          Filas = límite asignado · Columnas = antigüedad desde la activación ·{' '}
          <Link href="/segmentos" className="text-gray-400 underline hover:text-gray-600">¿Qué es cada segmento?</Link>
        </p>
        <CanalPills canal={canal} onChange={setCanal} />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs border-separate" style={{ borderSpacing: '3px' }}>
          <thead>
            <tr>
              <th className="px-2 py-1"></th>
              {NUMEROS.map(n => (
                <th key={n.numero} className="rounded-lg bg-magenta-600 px-2 py-1.5 text-center">
                  <span className="block text-sm font-bold text-white">{n.numero}</span>
                  <span className="block text-[10px] font-normal text-magenta-100">{n.detalle}</span>
                </th>
              ))}
              <th className="rounded-lg bg-magenta-600 px-2 py-1.5 text-center">
                <span className="block text-sm font-bold text-white">Total</span>
                <span className="block text-[10px] font-normal text-magenta-100">por límite</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {LETRAS.map(l => (
              <tr key={l.letra}>
                <td className="rounded-lg bg-magenta-600 px-2 py-1 whitespace-nowrap">
                  <span className="text-sm font-bold text-white">{l.letra}</span>
                  <span className="block text-[10px] text-magenta-100">{l.detalle}</span>
                </td>
                {NUMEROS.map(n => {
                  const v = celda(l.letra, n.numero)
                  const [r, g, b] = COLOR_NUMERO[n.numero]
                  const alpha = v === 0 ? 0.05 : 0.12 + (v / maxCelda) * 0.38
                  return (
                    <td
                      key={n.numero}
                      className="rounded-lg px-2 py-2.5 text-center align-middle"
                      style={{ backgroundColor: `rgba(${r}, ${g}, ${b}, ${alpha})` }}
                    >
                      <span className="block text-[10px] font-semibold text-gray-500">{l.letra}{n.numero}</span>
                      <span className="block text-sm font-bold text-gray-900">{v.toLocaleString('es-AR')}</span>
                      <span className="block text-[10px] text-gray-600">{pct(v)}</span>
                    </td>
                  )
                })}
                <td className="rounded-lg bg-magenta-50 px-2 py-2.5 text-center align-middle">
                  <span className="block text-sm font-bold text-magenta-700">{totalLetra(l.letra).toLocaleString('es-AR')}</span>
                  <span className="block text-[10px] text-magenta-400">{pct(totalLetra(l.letra))}</span>
                </td>
              </tr>
            ))}
            <tr>
              <td className="rounded-lg bg-magenta-600 px-2 py-1.5">
                <span className="text-sm font-bold text-white">Total</span>
                <span className="block text-[10px] text-magenta-100">por antigüedad</span>
              </td>
              {NUMEROS.map(n => (
                <td key={n.numero} className="rounded-lg bg-magenta-50 px-2 py-2.5 text-center align-middle">
                  <span className="block text-sm font-bold text-magenta-700">{totalNumero(n.numero).toLocaleString('es-AR')}</span>
                  <span className="block text-[10px] text-magenta-400">{pct(totalNumero(n.numero))}</span>
                </td>
              ))}
              <td className="rounded-lg bg-magenta-600 px-2 py-2.5 text-center align-middle">
                <span className="block text-sm font-bold text-white">{totalMatriz.toLocaleString('es-AR')}</span>
                <span className="block text-[10px] text-magenta-100">{pct(totalMatriz)}</span>
              </td>
            </tr>
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
