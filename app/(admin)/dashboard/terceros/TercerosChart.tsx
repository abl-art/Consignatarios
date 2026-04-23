'use client'

import { useState, useMemo } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'

interface VentaTercero {
  store_name: string
  fecha: string
  ventas: number
  monto: number
}

interface Props {
  data: VentaTercero[]
}

type Periodo = 'hoy' | 'ayer' | '7d' | 'mes' | 'todo'
type Metrica = 'cantidad' | 'pesos'

const COLORES = ['#E91E7B', '#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EF4444', '#06B6D4', '#F97316', '#6366F1', '#84CC16']
const fmt = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 })

function formatLabel(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(0)}K`
  return String(value)
}

function formatDate(ds: string): string {
  const [, m, d] = ds.split('-')
  return `${d}/${m}`
}

function getMerchant(storeName: string): string {
  return storeName.split(/[\s-]/)[0].trim().toUpperCase()
}

function getTienda(storeName: string): string {
  return storeName.replace(/\s+/g, ' ').trim()
}

function getDateRange(periodo: Periodo): { desde: string; hasta: string } {
  const hoy = new Date()
  const hasta = hoy.toISOString().slice(0, 10)
  if (periodo === 'hoy') return { desde: hasta, hasta }
  if (periodo === 'ayer') {
    const ayer = new Date(hoy)
    ayer.setDate(ayer.getDate() - 1)
    return { desde: ayer.toISOString().slice(0, 10), hasta: ayer.toISOString().slice(0, 10) }
  }
  if (periodo === '7d') {
    const d = new Date(hoy)
    d.setDate(d.getDate() - 7)
    return { desde: d.toISOString().slice(0, 10), hasta }
  }
  if (periodo === 'mes') {
    return { desde: `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-01`, hasta }
  }
  return { desde: '2020-01-01', hasta }
}

export default function TercerosChart({ data }: Props) {
  const [periodo, setPeriodo] = useState<Periodo>('mes')
  const [metrica, setMetrica] = useState<Metrica>('cantidad')
  const [merchantFiltro, setMerchantFiltro] = useState<string>('')

  const merchants = useMemo(() => [...new Set(data.map(d => getMerchant(d.store_name)))].sort(), [data])

  const chartData = useMemo(() => {
    const { desde, hasta } = getDateRange(periodo)

    // Filtrar por fecha
    let filtrados = data.filter(d => d.fecha >= desde && d.fecha <= hasta)

    // Determinar las series (líneas del gráfico)
    let seriesNames: string[]
    if (merchantFiltro) {
      // Con merchant seleccionado: mostrar tiendas de ese merchant
      filtrados = filtrados.filter(d => getMerchant(d.store_name) === merchantFiltro)
      seriesNames = [...new Set(filtrados.map(d => getTienda(d.store_name)))].sort()
    } else {
      // Sin merchant: mostrar merchants
      seriesNames = [...new Set(filtrados.map(d => getMerchant(d.store_name)))].sort()
    }

    // Agrupar por día o por mes según periodo
    const agruparPorMes = periodo === 'mes' || periodo === 'todo'
    const getKey = (fecha: string) => agruparPorMes ? fecha.slice(0, 7) : fecha
    const formatKey = (key: string) => agruparPorMes ? key : formatDate(key)

    const keys = [...new Set(filtrados.map(d => getKey(d.fecha)))].sort()
    const result = keys.map(key => {
      const row: Record<string, number | string> = { fecha: formatKey(key) }
      for (const serie of seriesNames) {
        const items = filtrados.filter(d => {
          const serieKey = merchantFiltro ? getTienda(d.store_name) : getMerchant(d.store_name)
          return getKey(d.fecha) === key && serieKey === serie
        })
        row[serie] = Math.round(items.reduce((s, d) => s + (metrica === 'pesos' ? d.monto : d.ventas), 0))
      }
      return row
    })

    return { result, seriesNames }
  }, [data, periodo, metrica, merchantFiltro])

  const periodos: { key: Periodo; label: string }[] = [
    { key: 'hoy', label: 'Hoy' },
    { key: 'ayer', label: 'Ayer' },
    { key: '7d', label: '7 días' },
    { key: 'mes', label: 'Mes' },
    { key: 'todo', label: 'Todo' },
  ]

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-700">
            Ventas terceros {merchantFiltro ? `— ${merchantFiltro}` : '— por merchant'}
          </h3>
          <p className="text-xs text-gray-400">
            {merchantFiltro ? 'Desglose por tienda' : 'Click en merchant para ver tiendas'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {/* Periodo */}
          <div className="flex gap-1">
            {periodos.map(p => (
              <button key={p.key} onClick={() => setPeriodo(p.key)}
                className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${periodo === p.key ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                {p.label}
              </button>
            ))}
          </div>
          {/* Metrica */}
          <div className="flex gap-1">
            <button onClick={() => setMetrica('cantidad')}
              className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${metrica === 'cantidad' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
              Cantidad
            </button>
            <button onClick={() => setMetrica('pesos')}
              className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${metrica === 'pesos' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
              Pesos
            </button>
          </div>
        </div>
      </div>

      {/* Filtro merchant */}
      <div className="flex flex-wrap gap-1 mb-4">
        <button onClick={() => setMerchantFiltro('')}
          className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${!merchantFiltro ? 'bg-magenta-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
          Todos
        </button>
        {merchants.map(m => (
          <button key={m} onClick={() => setMerchantFiltro(m)}
            className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${merchantFiltro === m ? 'bg-magenta-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            {m}
          </button>
        ))}
      </div>

      {chartData.result.length === 0 ? (
        <p className="text-center text-gray-400 text-sm py-8">Sin datos para este período</p>
      ) : (
        <div className="w-full h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData.result} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="fecha" stroke="#6b7280" fontSize={10} interval="preserveStartEnd" />
              <YAxis stroke="#6b7280" fontSize={10} tickFormatter={formatLabel} />
              <Tooltip
                formatter={(value) => [metrica === 'pesos' ? `$${fmt.format(Number(value))}` : value, '']}
                labelStyle={{ color: '#374151' }}
                contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 11 }}
              />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              {chartData.seriesNames.map((serie, i) => (
                <Line key={serie} type="monotone" dataKey={serie} stroke={COLORES[i % COLORES.length]} strokeWidth={2} dot={{ r: 3, fill: COLORES[i % COLORES.length] }} activeDot={{ r: 5 }}
                  label={{ position: 'top', fontSize: 9, fill: COLORES[i % COLORES.length], formatter: (v: unknown) => Number(v) > 0 ? formatLabel(Number(v)) : '' }} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
