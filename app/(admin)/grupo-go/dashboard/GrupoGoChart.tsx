'use client'

import { useState, useMemo } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import type { ChartDayRow } from '@/lib/actions/grupo-go'

const MODELOS = ['GOcuotas', 'GOPremium', 'GOAdelantos', 'GOTarjeta', 'GOBig', 'GOQr', 'GOPlus', 'GOcelular']

const COLORES: Record<string, string> = {
  GOcuotas: '#2563eb',
  GOPremium: '#9333ea',
  GOAdelantos: '#059669',
  GOTarjeta: '#d97706',
  GOBig: '#e11d48',
  GOQr: '#4f46e5',
  GOPlus: '#0d9488',
  GOcelular: '#ea580c',
  Todos: '#111827',
}

type Metrica = 'ops' | 'monto' | 'usuarios'

function formatearMoneda(n: number) {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`
  return `$${n.toFixed(0)}`
}

function formatearNumero(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toFixed(0)
}

export default function GrupoGoChart({ data }: { data: ChartDayRow[] }) {
  const [metrica, setMetrica] = useState<Metrica>('ops')
  const [todoActivo, setTodoActivo] = useState(true)
  const [modelosActivos, setModelosActivos] = useState<Set<string>>(new Set())

  function activarTodos() {
    setTodoActivo(true)
    setModelosActivos(new Set())
  }

  function toggleModelo(m: string) {
    if (todoActivo) {
      // Switch from "Todos" to individual model
      setTodoActivo(false)
      setModelosActivos(new Set([m]))
      return
    }
    const next = new Set(modelosActivos)
    if (next.has(m)) {
      next.delete(m)
      if (next.size === 0) {
        // If none left, go back to Todos
        setTodoActivo(true)
        return
      }
    } else {
      next.add(m)
    }
    setModelosActivos(next)
  }

  const suffix = metrica === 'ops' ? '_ops' : metrica === 'monto' ? '_monto' : '_usuarios'
  const formatter = metrica === 'monto' ? formatearMoneda : formatearNumero
  const tooltipFormatter = metrica === 'monto'
    ? (v: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(v)
    : (v: number) => new Intl.NumberFormat('es-AR').format(v)

  // Compute "Todos" totals per month
  const dataConTotales = useMemo(() => {
    return data.map(row => {
      let total = 0
      for (const m of MODELOS) {
        total += Number(row[`${m}${suffix}`] || 0)
      }
      return { ...row, [`Todos${suffix}`]: total }
    })
  }, [data, suffix])

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Evolución mensual</h3>
        <div className="flex gap-1">
          {([
            { key: 'ops', label: 'Operaciones' },
            { key: 'monto', label: 'Monto' },
            { key: 'usuarios', label: 'Nuevos usuarios' },
          ] as { key: Metrica; label: string }[]).map(m => (
            <button
              key={m.key}
              onClick={() => setMetrica(m.key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border ${
                metrica === m.key
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* Model toggles */}
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={activarTodos}
          className={`px-2.5 py-1 text-xs font-medium rounded-full border transition-colors ${
            todoActivo
              ? 'text-white border-transparent bg-gray-900'
              : 'text-gray-400 border-gray-200 bg-white'
          }`}
        >
          Todos
        </button>
        {MODELOS.map(m => (
          <button
            key={m}
            onClick={() => toggleModelo(m)}
            className={`px-2.5 py-1 text-xs font-medium rounded-full border transition-colors ${
              !todoActivo && modelosActivos.has(m)
                ? 'text-white border-transparent'
                : todoActivo
                ? 'text-gray-300 border-gray-100 bg-white'
                : 'text-gray-400 border-gray-200 bg-white'
            }`}
            style={!todoActivo && modelosActivos.has(m) ? { backgroundColor: COLORES[m] } : undefined}
          >
            {m}
          </button>
        ))}
      </div>

      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={dataConTotales} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
            <XAxis
              dataKey="dia"
              tick={{ fontSize: 10, fill: '#9ca3af' }}
              tickFormatter={(v: string) => {
                const nombres = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
                const [, m] = v.split('-')
                return nombres[parseInt(m) - 1] || v
              }}
            />
            <YAxis
              tick={{ fontSize: 10, fill: '#9ca3af' }}
              tickFormatter={formatter}
              width={55}
            />
            <Tooltip
              labelFormatter={(v) => {
                const nombres = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
                const [y, m] = String(v).split('-')
                return `${nombres[parseInt(m) - 1]} ${y}`
              }}
              formatter={(value, name) => {
                const modelo = String(name).replace(suffix, '')
                return [tooltipFormatter(Number(value)), modelo]
              }}
              contentStyle={{ fontSize: 12 }}
            />
            {todoActivo ? (
              <Line
                type="monotone"
                dataKey={`Todos${suffix}`}
                name={`Todos${suffix}`}
                stroke={COLORES.Todos}
                strokeWidth={2.5}
                dot={false}
                connectNulls
              />
            ) : (
              MODELOS.filter(m => modelosActivos.has(m)).map(m => (
                <Line
                  key={m}
                  type="monotone"
                  dataKey={`${m}${suffix}`}
                  name={`${m}${suffix}`}
                  stroke={COLORES[m]}
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                />
              ))
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
