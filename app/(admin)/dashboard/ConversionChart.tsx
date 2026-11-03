'use client'

import { useState, useMemo } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import type { ConversionGocuotas } from '@/lib/gocelular'

type Granularidad = 'mensual' | 'diario'

// Paleta validada (dataviz): magenta de marca para la serie principal y el
// azul del repo para la de referencia — PASS en CVD y contraste sobre blanco.
const COLOR_USUARIOS = '#E91E7B'
const COLOR_ORDENES = '#2563eb'

function Pill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 text-xs font-medium rounded-full border transition-colors ${
        active
          ? 'bg-[#E91E7B] text-white border-[#E91E7B]'
          : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
      }`}
    >
      {label}
    </button>
  )
}

function formatMonth(yyyyMm: string): string {
  const [year, month] = yyyyMm.split('-')
  const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
  return `${monthNames[parseInt(month, 10) - 1]} ${year}`
}

function formatDay(yyyyMmDd: string): string {
  const [, month, day] = yyyyMmDd.split('-')
  const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
  return `${parseInt(day, 10)} ${monthNames[parseInt(month, 10) - 1]}`
}

export default function ConversionChart({ data }: { data: ConversionGocuotas }) {
  const [granularidad, setGranularidad] = useState<Granularidad>('mensual')

  // La serie mensual viene con DISTINCT real por mes desde la query — acá no
  // se re-agrega nada, solo se calculan los porcentajes de cada punto.
  const chartData = useMemo(() => {
    const filas = granularidad === 'mensual' ? data.mensual : data.diaria
    return filas.map(p => ({
      label: granularidad === 'mensual' ? formatMonth(p.fecha) : formatDay(p.fecha),
      pctUsuarios: p.usuarios > 0 ? Math.round((p.usuariosConf / p.usuarios) * 10000) / 100 : 0,
      pctOrdenes: p.total > 0 ? Math.round((p.delivered / p.total) * 10000) / 100 : 0,
    }))
  }, [data, granularidad])

  const etiquetaPunto =
    granularidad === 'mensual'
      ? (((props: { x: number; y: number; value: number }) => (
          <text x={props.x} y={props.y - 10} textAnchor="middle" fill="#6b7280" fontSize={9}>
            {props.value.toFixed(1)}%
          </text>
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        )) as any)
      : undefined

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-1">
        <h3 className="text-sm font-semibold text-gray-800">Conversión GOcuotas</h3>
        {data.ordenesPorUsuario30d !== null && (
          <p className="text-xs text-gray-500">
            <span className="font-semibold text-gray-700">{data.ordenesPorUsuario30d.toLocaleString('es-AR')}</span> órdenes creadas por usuario (30d)
          </p>
        )}
      </div>
      <p className="text-xs text-gray-400 mb-4">
        usuarios que confirman / usuarios que llegan al checkout · la línea azul (por orden) baja cuando la gente necesita más intentos
      </p>

      <div className="flex items-center gap-1 mb-4">
        <Pill label="Mensual" active={granularidad === 'mensual'} onClick={() => setGranularidad('mensual')} />
        <Pill label="Diario" active={granularidad === 'diario'} onClick={() => setGranularidad('diario')} />
      </div>

      <div className="w-full h-72">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 20, right: 20, bottom: 5, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="label" stroke="#6b7280" fontSize={11} />
            <YAxis stroke="#6b7280" fontSize={11} tickFormatter={(v) => `${v}%`} domain={[0, 'auto']} />
            <Tooltip
              formatter={(value, name) => [
                `${Number(value).toFixed(2)}%`,
                name === 'pctUsuarios' ? 'Por usuario único' : 'Por orden',
              ]}
              labelStyle={{ color: '#374151' }}
              contentStyle={{
                backgroundColor: '#ffffff',
                border: '1px solid #e5e7eb',
                borderRadius: 8,
                fontSize: 12,
              }}
            />
            <Legend
              formatter={(value: string) => (
                <span style={{ color: '#374151', fontSize: 12 }}>
                  {value === 'pctUsuarios' ? 'Por usuario único' : 'Por orden'}
                </span>
              )}
            />
            <Line
              type="monotone"
              dataKey="pctUsuarios"
              stroke={COLOR_USUARIOS}
              strokeWidth={2}
              dot={granularidad === 'mensual' ? { r: 4, fill: COLOR_USUARIOS } : false}
              label={etiquetaPunto}
            />
            <Line
              type="monotone"
              dataKey="pctOrdenes"
              stroke={COLOR_ORDENES}
              strokeWidth={1.5}
              strokeDasharray="6 4"
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
