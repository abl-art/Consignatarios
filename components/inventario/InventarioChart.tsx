'use client'

import { useState, useMemo } from 'react'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import ExistenciasMensuales from '@/components/inventario/ExistenciasMensuales'
import type { CierreMensual } from '@/lib/actions/accesorios-ventas'
import type { VentaDia } from '@/lib/inventario-indicadores'

export interface ProductoChart {
  key: string
  label: string
  ventasDiarias: VentaDia[]
  cierres: CierreMensual[]
  /** Sin montos (ej. kits, que se regalan): oculta la píldora Pesos */
  sinMonto?: boolean
}

interface Props {
  /** Ventas por modelo de celulares (para la vista de barras) */
  celulares: { fecha: string; modelo: string; ventas: number }[]
  /** Accesorios y kits (vista de línea) */
  productos: ProductoChart[]
}

type Tiempo = '30d' | '7d' | 'ayer' | 'hoy' | 'personalizado'
type Agrupacion = 'diarias' | 'semanales' | 'mensuales'
type Metrica = 'cantidad' | 'pesos'

const fmtNumber = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 })

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max) + '...' : str
}

function abbreviate(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`
  return String(n)
}

function getISOWeekMonday(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  const monday = new Date(d)
  monday.setDate(diff)
  return monday.toISOString().slice(0, 10)
}

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

function formatDay(yyyyMmDd: string): string {
  const [, month, day] = yyyyMmDd.split('-')
  return `${parseInt(day, 10)} ${MESES[parseInt(month, 10) - 1]}`
}

function formatMonth(yyyyMm: string): string {
  const [year, month] = yyyyMm.split('-')
  return `${MESES[parseInt(month, 10) - 1]} ${year}`
}

function Pill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 text-xs font-medium rounded-full border transition-colors ${
        active ? 'bg-[#E91E7B] text-white border-[#E91E7B]' : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
      }`}
    >
      {label}
    </button>
  )
}

export default function InventarioChart({ celulares, productos }: Props) {
  const [producto, setProducto] = useState<string>('celulares')
  const [tiempo, setTiempo] = useState<Tiempo>('30d')
  const [desde, setDesde] = useState(daysAgo(30))
  const [hasta, setHasta] = useState(todayStr())
  const [agrupacion, setAgrupacion] = useState<Agrupacion>('diarias')
  const [metrica, setMetrica] = useState<Metrica>('cantidad')

  const rango = useMemo((): [string, string] => {
    const hoy = todayStr()
    switch (tiempo) {
      case 'hoy': return [hoy, hoy]
      case 'ayer': return [daysAgo(1), daysAgo(1)]
      case '7d': return [daysAgo(6), hoy]
      case '30d': return [daysAgo(29), hoy]
      case 'personalizado': return [desde, hasta]
    }
  }, [tiempo, desde, hasta])

  const seleccionado = productos.find(p => p.key === producto)
  const esCelulares = producto === 'celulares'
  const metricaEfectiva: Metrica = seleccionado?.sinMonto ? 'cantidad' : metrica

  // Vista celulares: barras por modelo
  const dataModelos = useMemo(() => {
    if (!esCelulares) return []
    const [f0, f1] = rango
    const groups = new Map<string, number>()
    for (const row of celulares) {
      if (row.fecha < f0 || row.fecha > f1) continue
      const model = (row.modelo || 'Desconocido').replace(/\s*\+\s*.*/i, '').trim()
      groups.set(model, (groups.get(model) ?? 0) + row.ventas)
    }
    return Array.from(groups.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 15)
      .map(([modelo, ventas]) => ({ modelo, ventas }))
  }, [esCelulares, celulares, rango])

  // Vista accesorios/kits: línea con agrupación
  const dataLinea = useMemo(() => {
    if (esCelulares || !seleccionado) return []
    const [f0, f1] = rango
    const groups = new Map<string, { cantidad: number; monto: number }>()
    for (const row of seleccionado.ventasDiarias) {
      if (row.fecha < f0 || row.fecha > f1) continue
      const key = agrupacion === 'diarias' ? row.fecha
        : agrupacion === 'semanales' ? getISOWeekMonday(row.fecha)
        : row.fecha.slice(0, 7)
      const existing = groups.get(key) ?? { cantidad: 0, monto: 0 }
      existing.cantidad += row.cantidad
      existing.monto += row.monto
      groups.set(key, existing)
    }
    return Array.from(groups.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, vals]) => ({
        label: agrupacion === 'diarias' ? formatDay(key)
          : agrupacion === 'semanales' ? `Sem ${formatDay(key)}`
          : formatMonth(key),
        valor: metricaEfectiva === 'pesos' ? vals.monto : vals.cantidad,
      }))
  }, [esCelulares, seleccionado, rango, agrupacion, metricaEfectiva])

  const formatValor = (n: number) => (metricaEfectiva === 'pesos' ? `$${fmtNumber.format(n)}` : fmtNumber.format(n))
  const chartHeightModelos = Math.max(256, dataModelos.length * 30 + 40)
  const sinDatos = esCelulares ? dataModelos.length === 0 : dataLinea.length === 0

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-base font-semibold text-gray-900 mb-4">Ventas por producto</h2>

        <div className="flex flex-wrap items-center gap-4 mb-4">
          {/* Producto */}
          <div className="flex flex-wrap items-center gap-1">
            <Pill label="Celulares" active={esCelulares} onClick={() => setProducto('celulares')} />
            {productos.map(p => (
              <Pill key={p.key} label={p.label} active={producto === p.key} onClick={() => setProducto(p.key)} />
            ))}
          </div>

          {/* Período */}
          <div className="flex items-center gap-1">
            <Pill label="30 dias" active={tiempo === '30d'} onClick={() => setTiempo('30d')} />
            <Pill label="7 dias" active={tiempo === '7d'} onClick={() => setTiempo('7d')} />
            <Pill label="Ayer" active={tiempo === 'ayer'} onClick={() => setTiempo('ayer')} />
            <Pill label="Hoy" active={tiempo === 'hoy'} onClick={() => setTiempo('hoy')} />
            <Pill label="Personalizado" active={tiempo === 'personalizado'} onClick={() => setTiempo('personalizado')} />
          </div>

          {tiempo === 'personalizado' && (
            <div className="flex items-center gap-2">
              <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="px-2 py-1 text-xs border border-gray-300 rounded-md" />
              <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="px-2 py-1 text-xs border border-gray-300 rounded-md" />
            </div>
          )}

          {/* Agrupación + métrica (solo vista de línea) */}
          {!esCelulares && (
            <>
              <div className="flex items-center gap-1">
                <Pill label="Diarias" active={agrupacion === 'diarias'} onClick={() => setAgrupacion('diarias')} />
                <Pill label="Semanales" active={agrupacion === 'semanales'} onClick={() => setAgrupacion('semanales')} />
                <Pill label="Mensuales" active={agrupacion === 'mensuales'} onClick={() => setAgrupacion('mensuales')} />
              </div>
              {!seleccionado?.sinMonto && (
                <div className="flex items-center gap-1">
                  <Pill label="Cantidad" active={metrica === 'cantidad'} onClick={() => setMetrica('cantidad')} />
                  <Pill label="Pesos" active={metrica === 'pesos'} onClick={() => setMetrica('pesos')} />
                </div>
              )}
            </>
          )}
        </div>

        {sinDatos ? (
          <div className="py-12 text-center text-gray-400 text-sm">Sin datos para el filtro seleccionado</div>
        ) : esCelulares ? (
          <div className="w-full" style={{ height: chartHeightModelos }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dataModelos} layout="vertical" margin={{ top: 5, right: 40, bottom: 5, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis type="number" stroke="#6b7280" fontSize={11} tickFormatter={(v) => fmtNumber.format(v)} />
                <YAxis type="category" dataKey="modelo" stroke="#6b7280" fontSize={11} width={180} tickFormatter={(v) => truncate(v, 28)} />
                <Tooltip
                  formatter={(value) => [fmtNumber.format(Number(value)), 'Ventas']}
                  labelStyle={{ color: '#374151' }}
                  contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 12 }}
                />
                <Bar dataKey="ventas" radius={[0, 4, 4, 0]} label={{ position: 'right', fontSize: 11, fill: '#6b7280' }}>
                  {dataModelos.map((_, index) => (
                    <Cell key={index} fill="#E91E7B" />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="w-full h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dataLinea} margin={{ top: 20, right: 20, bottom: 5, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="label" stroke="#6b7280" fontSize={11} />
                <YAxis stroke="#6b7280" fontSize={11} tickFormatter={formatValor} />
                <Tooltip
                  formatter={(value) => [formatValor(Number(value)), metricaEfectiva === 'pesos' ? 'Monto' : 'Cantidad']}
                  labelStyle={{ color: '#374151' }}
                  contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 12 }}
                />
                <Line
                  type="monotone"
                  dataKey="valor"
                  stroke="#E91E7B"
                  strokeWidth={2}
                  dot={{ r: 4, fill: '#E91E7B' }}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  label={((props: any) => (
                    <text x={props.x} y={props.y - 10} textAnchor="middle" fill="#6b7280" fontSize={9}>
                      {metricaEfectiva === 'pesos' ? `$${abbreviate(props.value)}` : abbreviate(props.value)}
                    </text>
                  )) as any}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Existencias mensuales del producto seleccionado */}
      {!esCelulares && seleccionado && (
        <ExistenciasMensuales cierres={seleccionado.cierres} categoria={seleccionado.label.toLowerCase()} />
      )}
    </div>
  )
}
