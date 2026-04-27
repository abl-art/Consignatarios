'use client'

import { useState, useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, Legend } from 'recharts'
import { formatearMoneda } from '@/lib/utils'

interface PedidoItem {
  productoNombre: string
  cantidad: number
  precio: number
}

interface Pedido {
  proveedorNombre: string
  fecha: string
  estado: string
  confirmadoAt?: string
  entregadoAt?: string
  items: PedidoItem[]
}

interface Props {
  pedidos: Pedido[]
}

type Vista = 'proveedor' | 'producto'
type Periodo = '7d' | 'semana' | 'mes' | 'custom' | 'todo'
type Metrica = 'unidades' | 'pesos'

const COLORES = ['#E91E7B', '#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EF4444', '#06B6D4', '#F97316']
const fmt = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 })

function formatLabel(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(0)}K`
  return String(value)
}

function parseFecha(fecha: string): Date {
  // "19/4/2026" o ISO
  if (fecha.includes('/')) {
    const [d, m, y] = fecha.split('/')
    return new Date(Number(y), Number(m) - 1, Number(d))
  }
  return new Date(fecha)
}

export default function ComprasAnalisis({ pedidos }: Props) {
  const [vista, setVista] = useState<Vista>('proveedor')
  const [periodo, setPeriodo] = useState<Periodo>('mes')
  const [metrica, setMetrica] = useState<Metrica>('unidades')
  const [filtroProveedor, setFiltroProveedor] = useState('')
  const [filtroProducto, setFiltroProducto] = useState('')
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')

  // Pedidos enviados (confirmados, independiente de si se recibieron)
  const entregados = useMemo(() => pedidos.filter(p => p.estado === 'enviado'), [pedidos])

  const proveedores = useMemo(() => [...new Set(entregados.map(p => p.proveedorNombre))].sort(), [entregados])
  const productos = useMemo(() => {
    const set = new Set<string>()
    entregados.forEach(p => p.items.forEach(i => set.add(i.productoNombre)))
    return [...set].sort()
  }, [entregados])

  // Filtrar por periodo
  const filtrados = useMemo(() => {
    const hoy = new Date()
    return entregados.filter(p => {
      const fecha = p.confirmadoAt ? new Date(p.confirmadoAt) : parseFecha(p.fecha)
      if (periodo === '7d') {
        const hace7 = new Date(hoy)
        hace7.setDate(hace7.getDate() - 7)
        return fecha >= hace7
      }
      if (periodo === 'semana') {
        const day = hoy.getDay()
        const lunes = new Date(hoy)
        lunes.setDate(hoy.getDate() - (day === 0 ? 6 : day - 1))
        lunes.setHours(0, 0, 0, 0)
        return fecha >= lunes
      }
      if (periodo === 'mes') {
        return fecha.getMonth() === hoy.getMonth() && fecha.getFullYear() === hoy.getFullYear()
      }
      if (periodo === 'custom') {
        if (fechaDesde && fecha < new Date(fechaDesde + 'T00:00:00')) return false
        if (fechaHasta && fecha > new Date(fechaHasta + 'T23:59:59')) return false
        return true
      }
      return true
    }).filter(p => !filtroProveedor || p.proveedorNombre === filtroProveedor)
      .filter(p => !filtroProducto || p.items.some(i => i.productoNombre === filtroProducto))
  }, [entregados, periodo, filtroProveedor, filtroProducto, fechaDesde, fechaHasta])

  // Datos para el gráfico
  const chartData = useMemo(() => {
    if (vista === 'proveedor') {
      const map: Record<string, { unidades: number; pesos: number }> = {}
      filtrados.forEach(p => {
        if (!map[p.proveedorNombre]) map[p.proveedorNombre] = { unidades: 0, pesos: 0 }
        p.items.forEach(i => {
          if (!filtroProducto || i.productoNombre === filtroProducto) {
            map[p.proveedorNombre].unidades += i.cantidad
            map[p.proveedorNombre].pesos += i.cantidad * i.precio
          }
        })
      })
      return Object.entries(map)
        .map(([nombre, d]) => ({ nombre, ...d }))
        .sort((a, b) => b[metrica === 'pesos' ? 'pesos' : 'unidades'] - a[metrica === 'pesos' ? 'pesos' : 'unidades'])
    } else {
      const map: Record<string, { unidades: number; pesos: number }> = {}
      filtrados.forEach(p => {
        p.items.forEach(i => {
          if (!map[i.productoNombre]) map[i.productoNombre] = { unidades: 0, pesos: 0 }
          map[i.productoNombre].unidades += i.cantidad
          map[i.productoNombre].pesos += i.cantidad * i.precio
        })
      })
      return Object.entries(map)
        .map(([nombre, d]) => ({ nombre, ...d }))
        .sort((a, b) => b[metrica === 'pesos' ? 'pesos' : 'unidades'] - a[metrica === 'pesos' ? 'pesos' : 'unidades'])
    }
  }, [filtrados, vista, metrica, filtroProducto])

  // Totales
  const totalUnidades = chartData.reduce((s, d) => s + d.unidades, 0)
  const totalPesos = chartData.reduce((s, d) => s + d.pesos, 0)

  return (
    <div className="mt-8">
      <h2 className="text-lg font-bold text-gray-900 mb-1">Análisis de compras</h2>
      <p className="text-sm text-gray-500 mb-4">Poder de negociación por proveedor y producto</p>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2 mb-4">
        <div className="flex gap-1">
          {([['7d', 'Últ. 7 días'], ['semana', 'Esta semana'], ['mes', 'Este mes'], ['custom', 'Fechas'], ['todo', 'Todo']] as const).map(([key, label]) => (
            <button key={key} onClick={() => setPeriodo(key as Periodo)}
              className={`px-3 py-1 text-xs font-medium rounded-full ${periodo === key ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {label}
            </button>
          ))}
        </div>
        {periodo === 'custom' && (
          <div className="flex gap-2 items-center">
            <input type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)} className="px-2 py-1 text-xs border border-gray-300 rounded-lg" />
            <span className="text-xs text-gray-400">a</span>
            <input type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)} className="px-2 py-1 text-xs border border-gray-300 rounded-lg" />
          </div>
        )}
        <div className="flex gap-1">
          {(['proveedor', 'producto'] as const).map(v => (
            <button key={v} onClick={() => setVista(v)}
              className={`px-3 py-1 text-xs font-medium rounded-full ${vista === v ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              Por {v}
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          {(['unidades', 'pesos'] as const).map(m => (
            <button key={m} onClick={() => setMetrica(m)}
              className={`px-3 py-1 text-xs font-medium rounded-full ${metrica === m ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {m === 'unidades' ? 'Unidades' : 'Pesos'}
            </button>
          ))}
        </div>
        <select value={filtroProveedor} onChange={e => setFiltroProveedor(e.target.value)}
          className="px-3 py-1 text-xs border border-gray-300 rounded-lg">
          <option value="">Todos los proveedores</option>
          {proveedores.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <select value={filtroProducto} onChange={e => setFiltroProducto(e.target.value)}
          className="px-3 py-1 text-xs border border-gray-300 rounded-lg">
          <option value="">Todos los productos</option>
          {productos.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      {/* Totales */}
      <div className="flex gap-4 mb-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4 flex-1">
          <p className="text-xs text-gray-500">Total unidades</p>
          <p className="text-2xl font-bold text-gray-900">{totalUnidades.toLocaleString('es-AR')}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 flex-1">
          <p className="text-xs text-gray-500">Total inversión</p>
          <p className="text-2xl font-bold text-green-700">{formatearMoneda(totalPesos)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 flex-1">
          <p className="text-xs text-gray-500">Pedidos</p>
          <p className="text-2xl font-bold text-gray-900">{filtrados.length}</p>
        </div>
      </div>

      {/* Gráfico */}
      {chartData.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400 text-sm">
          Sin compras para este período
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="w-full h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 30, bottom: 5, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis type="number" stroke="#6b7280" fontSize={10} tickFormatter={formatLabel} />
                <YAxis type="category" dataKey="nombre" stroke="#6b7280" fontSize={10} width={150} />
                <Tooltip formatter={(v) => [metrica === 'pesos' ? `$${fmt.format(Number(v))}` : `${fmt.format(Number(v))} u.`, '']}
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }} />
                <Bar dataKey={metrica === 'pesos' ? 'pesos' : 'unidades'} radius={[0, 4, 4, 0]}
                  label={{ position: 'right', fontSize: 10, formatter: (v: unknown) => formatLabel(Number(v)) }}>
                  {chartData.map((_, i) => <Cell key={i} fill={COLORES[i % COLORES.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Tabla detalle */}
      {chartData.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mt-4">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-2 font-medium text-gray-600">{vista === 'proveedor' ? 'Proveedor' : 'Producto'}</th>
                <th className="text-right px-4 py-2 font-medium text-gray-600">Unidades</th>
                <th className="text-right px-4 py-2 font-medium text-gray-600">Inversión</th>
                <th className="text-right px-4 py-2 font-medium text-gray-600">% del total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {chartData.map((d, i) => (
                <tr key={d.nombre} className="hover:bg-gray-50">
                  <td className="px-4 py-2 font-medium text-gray-900">
                    <span className="inline-block w-2.5 h-2.5 rounded-full mr-2" style={{ backgroundColor: COLORES[i % COLORES.length] }} />
                    {d.nombre}
                  </td>
                  <td className="px-4 py-2 text-right font-bold">{d.unidades.toLocaleString('es-AR')}</td>
                  <td className="px-4 py-2 text-right text-green-700">{formatearMoneda(d.pesos)}</td>
                  <td className="px-4 py-2 text-right text-gray-500">{totalPesos > 0 ? ((d.pesos / totalPesos) * 100).toFixed(1) : 0}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
